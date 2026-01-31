//! Bounded backtracking solver for finding trivial solutions.
//!
//! This solver searches for solutions to a puzzle that are "too simple"
//! (below minimum constraints). It uses early exit to stop immediately
//! when a trivial solution is found, making rejection fast.
//!
//! Adapted from RobozzleSolver's backtrack.rs

use std::collections::VecDeque;
use std::time::{Duration, Instant};

use crate::executor::{execute, ExecutionMetrics, ExecutionStatus};
use crate::pruning::{get_valid_instructions_for_slot, should_reject_program};
use crate::puzzle::{Instruction, MinConstraints, Program, PuzzleConfig};

/// Configuration for the solver
#[derive(Debug, Clone)]
pub struct SolverConfig {
    /// Maximum time to search
    pub timeout: Duration,
    /// Maximum steps per execution
    pub max_steps: usize,
    /// Maximum instructions in a solution
    pub max_instructions: usize,
    /// Minimum constraints - solutions below these are "trivial"
    pub min_constraints: MinConstraints,
}

impl Default for SolverConfig {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(15),
            max_steps: 200,
            max_instructions: 16,
            min_constraints: MinConstraints::default(),
        }
    }
}

/// Result of the solver search
#[derive(Debug, Clone)]
pub struct SolverResult {
    /// Whether the puzzle passed verification (no trivial solution found)
    pub valid: bool,
    /// Whether the search space was fully exhausted
    pub search_exhausted: bool,
    /// Number of programs tested
    pub programs_tested: usize,
    /// Time elapsed in milliseconds
    pub time_elapsed_ms: u64,
    /// If invalid, the trivial solution found
    pub trivial_solution: Option<Program>,
    /// Metrics of the trivial solution (if found)
    pub trivial_metrics: Option<ExecutionMetrics>,
    /// Reason for invalidity
    pub reason: Option<String>,
}

/// Check if metrics indicate a trivial solution
fn is_below_minimums(metrics: &ExecutionMetrics, min: &MinConstraints) -> bool {
    metrics.instructions < min.instructions
        || metrics.steps < min.steps
        || metrics.max_stack_depth < min.recursion_depth
        || metrics.conditionals_executed < min.conditionals
        || metrics.step_ratio() < min.step_ratio
}

/// A frame in the search representing a partial program
#[derive(Debug, Clone)]
struct SearchFrame {
    program: Program,
    /// Next slot to fill (function_index, instruction_index)
    next_slot: Option<(usize, usize)>,
}

impl SearchFrame {
    fn new(puzzle: &PuzzleConfig) -> Self {
        let program = Program::with_lengths(&puzzle.function_lengths);
        let next_slot = program.find_empty_slot();
        Self { program, next_slot }
    }

    fn with_program(program: Program) -> Self {
        let next_slot = program.find_empty_slot();
        Self { program, next_slot }
    }
}

/// Find a trivial solution using bounded backtracking search.
///
/// Returns `Some(solution)` if a trivial solution is found (early exit),
/// or `None` if no trivial solution exists within the search bounds.
pub fn find_trivial_solution(puzzle: &PuzzleConfig, config: &SolverConfig) -> SolverResult {
    let start_time = Instant::now();
    let deadline = start_time + config.timeout;

    let mut programs_tested: usize = 0;

    // Use a deque for DFS (depth-first is faster for finding any solution)
    let mut queue: VecDeque<SearchFrame> = VecDeque::new();
    queue.push_back(SearchFrame::new(puzzle));

    while let Some(frame) = queue.pop_back() {
        // Check timeout
        if Instant::now() > deadline {
            return SolverResult {
                valid: true, // Timeout without finding trivial = pass
                search_exhausted: false,
                programs_tested,
                time_elapsed_ms: start_time.elapsed().as_millis() as u64,
                trivial_solution: None,
                trivial_metrics: None,
                reason: None,
            };
        }

        // If program is complete (no more empty slots), test it
        if frame.next_slot.is_none() {
            programs_tested += 1;

            // Skip programs that violate structural rules
            if should_reject_program(&frame.program, puzzle) {
                continue;
            }

            // Execute the program
            let result = execute(puzzle, &frame.program, config.max_steps);

            if result.solved {
                // Check if this solution is trivial (below minimum constraints)
                if is_below_minimums(&result.metrics, &config.min_constraints) {
                    // EARLY EXIT: Found trivial solution!
                    return SolverResult {
                        valid: false,
                        search_exhausted: false,
                        programs_tested,
                        time_elapsed_ms: start_time.elapsed().as_millis() as u64,
                        trivial_solution: Some(frame.program),
                        trivial_metrics: Some(result.metrics.clone()),
                        reason: Some(format_trivial_reason(&result.metrics, &config.min_constraints)),
                    };
                }
                // Solution meets constraints - continue searching for simpler ones
                // (We don't stop here because there might be a simpler solution)
            }
            continue;
        }

        // Program is incomplete - expand by trying each valid instruction
        let (func_idx, inst_idx) = frame.next_slot.unwrap();

        // Check if we've exceeded max instructions
        if frame.program.count_instructions() >= config.max_instructions {
            continue;
        }

        // Get valid instructions for this slot
        let valid_instructions = get_valid_instructions_for_slot(
            &frame.program,
            func_idx,
            inst_idx,
            puzzle,
        );

        // Also consider leaving this slot empty and moving to next
        // (This allows for sparse solutions)
        let mut next_program = frame.program.clone();
        // Find next slot after this one
        let next_next_slot = {
            let mut found = false;
            let mut result = None;
            for fi in func_idx..5 {
                let start_i = if fi == func_idx { inst_idx + 1 } else { 0 };
                let func = next_program.get_function(fi);
                for ii in start_i..func.len() {
                    if func[ii].is_none() {
                        result = Some((fi, ii));
                        found = true;
                        break;
                    }
                }
                if found {
                    break;
                }
            }
            result
        };

        // Add "skip this slot" option if there are more slots
        if next_next_slot.is_some() {
            queue.push_back(SearchFrame {
                program: frame.program.clone(),
                next_slot: next_next_slot,
            });
        }

        // Add options for each valid instruction
        for instruction in valid_instructions {
            let new_program = frame.program.with_instruction(func_idx, inst_idx, Some(instruction));

            // Quick reject based on program structure
            if should_reject_program(&new_program, puzzle) {
                continue;
            }

            queue.push_back(SearchFrame::with_program(new_program));
        }
    }

    // Search exhausted without finding trivial solution
    SolverResult {
        valid: true,
        search_exhausted: true,
        programs_tested,
        time_elapsed_ms: start_time.elapsed().as_millis() as u64,
        trivial_solution: None,
        trivial_metrics: None,
        reason: None,
    }
}

/// Format a human-readable reason for why a solution is trivial
fn format_trivial_reason(metrics: &ExecutionMetrics, min: &MinConstraints) -> String {
    let mut reasons = Vec::new();

    if metrics.instructions < min.instructions {
        reasons.push(format!(
            "instructions {} < {}",
            metrics.instructions, min.instructions
        ));
    }
    if metrics.steps < min.steps {
        reasons.push(format!("steps {} < {}", metrics.steps, min.steps));
    }
    if metrics.max_stack_depth < min.recursion_depth {
        reasons.push(format!(
            "recursion_depth {} < {}",
            metrics.max_stack_depth, min.recursion_depth
        ));
    }
    if metrics.conditionals_executed < min.conditionals {
        reasons.push(format!(
            "conditionals {} < {}",
            metrics.conditionals_executed, min.conditionals
        ));
    }
    if metrics.step_ratio() < min.step_ratio {
        reasons.push(format!(
            "step_ratio {:.1} < {:.1}",
            metrics.step_ratio(),
            min.step_ratio
        ));
    }

    if reasons.is_empty() {
        "unknown".to_string()
    } else {
        reasons.join(", ")
    }
}

/// Alternative: Find ANY solution (for testing purposes)
pub fn find_any_solution(
    puzzle: &PuzzleConfig,
    timeout: Duration,
    max_steps: usize,
) -> Option<(Program, ExecutionMetrics)> {
    let start_time = Instant::now();
    let deadline = start_time + timeout;

    let mut queue: VecDeque<SearchFrame> = VecDeque::new();
    queue.push_back(SearchFrame::new(puzzle));

    while let Some(frame) = queue.pop_back() {
        if Instant::now() > deadline {
            return None;
        }

        if frame.next_slot.is_none() {
            if should_reject_program(&frame.program, puzzle) {
                continue;
            }

            let result = execute(puzzle, &frame.program, max_steps);
            if result.solved {
                return Some((frame.program, result.metrics));
            }
            continue;
        }

        let (func_idx, inst_idx) = frame.next_slot.unwrap();

        // Skip slot option
        let next_next_slot = {
            let mut result = None;
            for fi in func_idx..5 {
                let start_i = if fi == func_idx { inst_idx + 1 } else { 0 };
                let func = frame.program.get_function(fi);
                for ii in start_i..func.len() {
                    if func[ii].is_none() {
                        result = Some((fi, ii));
                        break;
                    }
                }
                if result.is_some() {
                    break;
                }
            }
            result
        };

        if next_next_slot.is_some() {
            queue.push_back(SearchFrame {
                program: frame.program.clone(),
                next_slot: next_next_slot,
            });
        }

        let valid_instructions =
            get_valid_instructions_for_slot(&frame.program, func_idx, inst_idx, puzzle);

        for instruction in valid_instructions {
            let new_program =
                frame
                    .program
                    .with_instruction(func_idx, inst_idx, Some(instruction));

            if should_reject_program(&new_program, puzzle) {
                continue;
            }

            queue.push_back(SearchFrame::with_program(new_program));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::puzzle::{
        Direction, FunctionLengths, InstructionType, Position, RobotStart, Tile, TileColor,
    };

    fn create_trivial_puzzle() -> PuzzleConfig {
        // A puzzle that can be solved with just "forward"
        PuzzleConfig {
            id: "trivial".to_string(),
            title: "Trivial".to_string(),
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
            robot_start: RobotStart {
                position: Position::new(0, 0),
                direction: Direction::Right,
            },
            function_lengths: FunctionLengths {
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
    fn test_find_trivial_solution() {
        let puzzle = create_trivial_puzzle();
        let config = SolverConfig {
            timeout: Duration::from_secs(5),
            max_steps: 100,
            max_instructions: 10,
            min_constraints: MinConstraints {
                instructions: 4,
                steps: 16,
                recursion_depth: 3,
                conditionals: 2,
                step_ratio: 3.0,
            },
        };

        let result = find_trivial_solution(&puzzle, &config);

        // This puzzle should have a trivial solution (just "forward")
        assert!(!result.valid);
        assert!(result.trivial_solution.is_some());
    }

    #[test]
    fn test_is_below_minimums() {
        let metrics = ExecutionMetrics {
            steps: 10,
            instructions: 3,
            max_stack_depth: 2,
            conditionals_executed: 1,
            ..Default::default()
        };

        let min = MinConstraints {
            instructions: 4,
            steps: 16,
            recursion_depth: 3,
            conditionals: 2,
            step_ratio: 3.0,
        };

        assert!(is_below_minimums(&metrics, &min));
    }
}
