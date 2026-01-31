//! Program execution engine with bounded steps and metrics tracking.
//!
//! This module provides a fast, bounded execution engine that tracks
//! detailed metrics needed for solution verification.

use crate::puzzle::{Direction, Instruction, InstructionType, Position, Program, PuzzleConfig, Tile, TileColor};
use smallvec::SmallVec;

/// Maximum stack depth before we consider it infinite recursion
const MAX_STACK_DEPTH: usize = 256;

/// Result status of program execution
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionStatus {
    /// All stars collected
    Solved,
    /// Robot fell off the grid
    Fell,
    /// Exceeded maximum steps
    Timeout,
    /// Detected infinite loop (cycle)
    Cycle,
    /// Stack overflow
    StackOverflow,
}

/// Metrics collected during execution
#[derive(Debug, Clone, Default)]
pub struct ExecutionMetrics {
    pub steps: usize,
    pub instructions: usize,
    pub max_stack_depth: usize,
    pub conditionals_executed: usize,
    pub functions_called: usize,
    pub tiles_visited: usize,
    pub stars_collected: usize,
    pub total_stars: usize,
    pub paints_executed: usize,
}

impl ExecutionMetrics {
    /// Calculate the step-to-instruction ratio
    pub fn step_ratio(&self) -> f32 {
        if self.instructions == 0 {
            0.0
        } else {
            self.steps as f32 / self.instructions as f32
        }
    }
}

/// Result of running a program
#[derive(Debug, Clone)]
pub struct ExecutionResult {
    pub status: ExecutionStatus,
    pub metrics: ExecutionMetrics,
    pub solved: bool,
}

/// A frame in the execution stack
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct StackFrame {
    func_index: u8,
    inst_index: u8,
}

impl StackFrame {
    fn new(func_index: usize, inst_index: usize) -> Self {
        Self {
            func_index: func_index as u8,
            inst_index: inst_index as u8,
        }
    }
}

/// Mutable grid state during execution
struct GridState {
    /// Grid tiles (row-major, cloned from puzzle)
    tiles: Vec<Vec<Option<Tile>>>,
    /// Robot position
    position: Position,
    /// Robot direction
    direction: Direction,
    /// Stars remaining
    stars_remaining: usize,
}

impl GridState {
    fn from_puzzle(puzzle: &PuzzleConfig) -> Self {
        let tiles: Vec<Vec<Option<Tile>>> = puzzle
            .grid
            .iter()
            .map(|row| row.iter().map(|t| t.clone()).collect())
            .collect();

        let stars_remaining = puzzle.count_stars();

        Self {
            tiles,
            position: puzzle.robot_start.position,
            direction: puzzle.robot_start.direction,
            stars_remaining,
        }
    }

    fn get_tile(&self, x: i32, y: i32) -> Option<&Tile> {
        if y < 0 || x < 0 {
            return None;
        }
        self.tiles
            .get(y as usize)
            .and_then(|row| row.get(x as usize))
            .and_then(|opt| opt.as_ref())
    }

    fn get_tile_mut(&mut self, x: i32, y: i32) -> Option<&mut Tile> {
        if y < 0 || x < 0 {
            return None;
        }
        self.tiles
            .get_mut(y as usize)
            .and_then(|row| row.get_mut(x as usize))
            .and_then(|opt| opt.as_mut())
    }

    fn current_tile(&self) -> Option<&Tile> {
        self.get_tile(self.position.x, self.position.y)
    }

    fn current_color(&self) -> Option<TileColor> {
        self.current_tile().and_then(|t| t.color)
    }
}

/// Execute a program on a puzzle with bounded steps
pub fn execute(
    puzzle: &PuzzleConfig,
    program: &Program,
    max_steps: usize,
) -> ExecutionResult {
    let mut state = GridState::from_puzzle(puzzle);
    let total_stars = state.stars_remaining;

    let mut metrics = ExecutionMetrics {
        instructions: program.count_instructions(),
        total_stars,
        ..Default::default()
    };

    // Track visited tiles
    let mut visited_tiles = std::collections::HashSet::new();
    visited_tiles.insert((state.position.x, state.position.y));
    metrics.tiles_visited = 1;

    // Execution stack (using SmallVec for efficiency)
    let mut stack: SmallVec<[StackFrame; 64]> = SmallVec::new();

    // Start with F1
    let f1_len = program.f1.len();
    if f1_len > 0 {
        // Push F1 instructions in reverse order (so index 0 is at top)
        for i in (0..f1_len).rev() {
            stack.push(StackFrame::new(0, i));
        }
    }

    // Cycle detection: track state hashes
    let mut seen_states = std::collections::HashSet::new();

    while !stack.is_empty() {
        // Check step limit
        if metrics.steps >= max_steps {
            return ExecutionResult {
                status: ExecutionStatus::Timeout,
                metrics,
                solved: false,
            };
        }

        // Check stack depth
        if stack.len() > MAX_STACK_DEPTH {
            return ExecutionResult {
                status: ExecutionStatus::StackOverflow,
                metrics,
                solved: false,
            };
        }

        metrics.max_stack_depth = metrics.max_stack_depth.max(stack.len());

        // Pop the next instruction to execute
        let frame = stack.pop().unwrap();
        let func_index = frame.func_index as usize;
        let inst_index = frame.inst_index as usize;

        // Get the instruction
        let instruction = match program.get(func_index, inst_index) {
            Some(inst) => inst,
            None => continue, // Skip null slots
        };

        // Check color condition
        let current_color = state.current_color();
        if !instruction.should_execute(current_color) {
            continue; // Condition not met, skip
        }

        // Track conditional execution
        if instruction.condition.is_some() {
            metrics.conditionals_executed += 1;
        }

        // Cycle detection: create state hash
        // Only check periodically for performance
        if metrics.steps % 16 == 0 {
            let state_hash = create_state_hash(&state, &stack, &state.stars_remaining);
            if seen_states.contains(&state_hash) {
                return ExecutionResult {
                    status: ExecutionStatus::Cycle,
                    metrics,
                    solved: false,
                };
            }
            seen_states.insert(state_hash);
        }

        // Execute the instruction
        metrics.steps += 1;

        match instruction.instruction_type {
            InstructionType::Forward => {
                let (dx, dy) = state.direction.delta();
                let new_x = state.position.x + dx;
                let new_y = state.position.y + dy;

                // Check if valid tile
                if state.get_tile(new_x, new_y).is_none() {
                    return ExecutionResult {
                        status: ExecutionStatus::Fell,
                        metrics,
                        solved: false,
                    };
                }

                // Move robot
                state.position = Position::new(new_x, new_y);

                // Track visited
                if visited_tiles.insert((new_x, new_y)) {
                    metrics.tiles_visited += 1;
                }

                // Collect star if present
                if let Some(tile) = state.get_tile_mut(new_x, new_y) {
                    if tile.has_star {
                        tile.has_star = false;
                        state.stars_remaining -= 1;
                        metrics.stars_collected += 1;

                        // Check if solved
                        if state.stars_remaining == 0 {
                            return ExecutionResult {
                                status: ExecutionStatus::Solved,
                                metrics,
                                solved: true,
                            };
                        }
                    }
                }
            }

            InstructionType::Left => {
                state.direction = state.direction.turn_left();
            }

            InstructionType::Right => {
                state.direction = state.direction.turn_right();
            }

            InstructionType::F1
            | InstructionType::F2
            | InstructionType::F3
            | InstructionType::F4
            | InstructionType::F5 => {
                let target_func = instruction.instruction_type.function_index().unwrap();
                let func_len = program.get_function(target_func).len();

                if func_len > 0 {
                    metrics.functions_called += 1;
                    // Push function instructions in reverse order
                    for i in (0..func_len).rev() {
                        stack.push(StackFrame::new(target_func, i));
                    }
                }
            }

            InstructionType::PaintRed => {
                if let Some(tile) = state.get_tile_mut(state.position.x, state.position.y) {
                    tile.color = Some(TileColor::Red);
                    metrics.paints_executed += 1;
                }
            }

            InstructionType::PaintGreen => {
                if let Some(tile) = state.get_tile_mut(state.position.x, state.position.y) {
                    tile.color = Some(TileColor::Green);
                    metrics.paints_executed += 1;
                }
            }

            InstructionType::PaintBlue => {
                if let Some(tile) = state.get_tile_mut(state.position.x, state.position.y) {
                    tile.color = Some(TileColor::Blue);
                    metrics.paints_executed += 1;
                }
            }

            InstructionType::Noop => {
                // Do nothing
            }
        }

        // F1 auto-loop: if stack is empty, restart F1
        if stack.is_empty() {
            let f1_len = program.f1.len();
            if f1_len > 0 {
                for i in (0..f1_len).rev() {
                    stack.push(StackFrame::new(0, i));
                }
            }
        }
    }

    // Stack empty without solving - should not normally happen
    ExecutionResult {
        status: ExecutionStatus::Timeout,
        metrics,
        solved: false,
    }
}

/// Create a hash of the current state for cycle detection
fn create_state_hash(
    state: &GridState,
    stack: &SmallVec<[StackFrame; 64]>,
    stars_remaining: &usize,
) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();

    // Position and direction
    state.position.x.hash(&mut hasher);
    state.position.y.hash(&mut hasher);
    (state.direction as u8).hash(&mut hasher);

    // Stars remaining
    stars_remaining.hash(&mut hasher);

    // Top of stack (last 4 elements for efficiency)
    let stack_start = stack.len().saturating_sub(4);
    for frame in &stack[stack_start..] {
        frame.func_index.hash(&mut hasher);
        frame.inst_index.hash(&mut hasher);
    }
    stack.len().hash(&mut hasher);

    hasher.finish()
}

/// Simple verification: does the program solve the puzzle?
pub fn verify_solution(puzzle: &PuzzleConfig, program: &Program) -> bool {
    execute(puzzle, program, 500).solved
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_simple_puzzle() -> PuzzleConfig {
        // A simple 3x1 puzzle: [start] -> [star]
        PuzzleConfig {
            id: "test".to_string(),
            title: "Test".to_string(),
            grid: vec![vec![
                Some(Tile {
                    color: Some(TileColor::Red),
                    has_star: false,
                }),
                Some(Tile {
                    color: Some(TileColor::Red),
                    has_star: true,
                }),
            ]],
            robot_start: crate::puzzle::RobotStart {
                position: Position::new(0, 0),
                direction: Direction::Right,
            },
            function_lengths: crate::puzzle::FunctionLengths {
                f1: 5,
                f2: 0,
                f3: 0,
                f4: 0,
                f5: 0,
            },
            allowed_instructions: vec![InstructionType::Forward],
            solution: None,
        }
    }

    #[test]
    fn test_simple_execution() {
        let puzzle = create_simple_puzzle();
        let mut program = Program::new();
        program.f1 = vec![Some(Instruction::new(InstructionType::Forward))];

        let result = execute(&puzzle, &program, 100);
        assert!(result.solved);
        assert_eq!(result.metrics.stars_collected, 1);
        assert_eq!(result.metrics.steps, 1);
    }

    #[test]
    fn test_conditional_execution() {
        let puzzle = create_simple_puzzle();
        let mut program = Program::new();
        program.f1 = vec![
            // Blue conditional should not execute (tile is red)
            Some(Instruction::with_condition(
                InstructionType::Left,
                TileColor::Blue,
            )),
            // Red conditional should execute
            Some(Instruction::with_condition(
                InstructionType::Forward,
                TileColor::Red,
            )),
        ];

        let result = execute(&puzzle, &program, 100);
        assert!(result.solved);
        // Only the red conditional executes (blue is skipped)
        assert_eq!(result.metrics.conditionals_executed, 1);
        assert_eq!(result.metrics.steps, 1); // Only forward executed
    }

    #[test]
    fn test_timeout_or_cycle() {
        let puzzle = create_simple_puzzle();
        let mut program = Program::new();
        // Infinite loop: turn right forever
        program.f1 = vec![Some(Instruction::new(InstructionType::Right))];

        let result = execute(&puzzle, &program, 100);
        assert!(!result.solved);
        // Could be Timeout or Cycle depending on cycle detection
        assert!(
            result.status == ExecutionStatus::Timeout
                || result.status == ExecutionStatus::Cycle
        );
    }
}
