//! Puzzle representation types that match the TypeScript JSON format.
//!
//! These types are designed to deserialize directly from the JSON output
//! of the TypeScript puzzle generator.

use serde::{Deserialize, Serialize};

/// Tile color - matches TypeScript TileColor
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TileColor {
    Red,
    Green,
    Blue,
}

impl TileColor {
    /// Convert to condition mask for instruction matching
    pub fn to_condition_mask(self) -> u8 {
        match self {
            TileColor::Red => 0b001,
            TileColor::Green => 0b010,
            TileColor::Blue => 0b100,
        }
    }
}

/// Direction - matches TypeScript Direction
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    Up,
    Down,
    Left,
    Right,
}

impl Direction {
    pub fn turn_left(self) -> Direction {
        match self {
            Direction::Up => Direction::Left,
            Direction::Left => Direction::Down,
            Direction::Down => Direction::Right,
            Direction::Right => Direction::Up,
        }
    }

    pub fn turn_right(self) -> Direction {
        match self {
            Direction::Up => Direction::Right,
            Direction::Right => Direction::Down,
            Direction::Down => Direction::Left,
            Direction::Left => Direction::Up,
        }
    }

    pub fn delta(self) -> (i32, i32) {
        match self {
            Direction::Up => (0, -1),
            Direction::Down => (0, 1),
            Direction::Left => (-1, 0),
            Direction::Right => (1, 0),
        }
    }
}

/// Instruction type - matches TypeScript InstructionType
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstructionType {
    Forward,
    Left,
    Right,
    F1,
    F2,
    F3,
    F4,
    F5,
    PaintRed,
    PaintGreen,
    PaintBlue,
    Noop,
}

impl InstructionType {
    /// Check if this is a function call
    pub fn is_function_call(self) -> bool {
        matches!(
            self,
            InstructionType::F1
                | InstructionType::F2
                | InstructionType::F3
                | InstructionType::F4
                | InstructionType::F5
        )
    }

    /// Check if this is a turn instruction
    pub fn is_turn(self) -> bool {
        matches!(self, InstructionType::Left | InstructionType::Right)
    }

    /// Check if this is a paint instruction
    pub fn is_paint(self) -> bool {
        matches!(
            self,
            InstructionType::PaintRed | InstructionType::PaintGreen | InstructionType::PaintBlue
        )
    }

    /// Get the function index (0-4) if this is a function call
    pub fn function_index(self) -> Option<usize> {
        match self {
            InstructionType::F1 => Some(0),
            InstructionType::F2 => Some(1),
            InstructionType::F3 => Some(2),
            InstructionType::F4 => Some(3),
            InstructionType::F5 => Some(4),
            _ => None,
        }
    }

    /// Get the paint color if this is a paint instruction
    pub fn paint_color(self) -> Option<TileColor> {
        match self {
            InstructionType::PaintRed => Some(TileColor::Red),
            InstructionType::PaintGreen => Some(TileColor::Green),
            InstructionType::PaintBlue => Some(TileColor::Blue),
            _ => None,
        }
    }
}

/// A single instruction with optional color condition
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Instruction {
    #[serde(rename = "type")]
    pub instruction_type: InstructionType,
    pub condition: Option<TileColor>,
}

impl Instruction {
    pub fn new(instruction_type: InstructionType) -> Self {
        Self {
            instruction_type,
            condition: None,
        }
    }

    pub fn with_condition(instruction_type: InstructionType, condition: TileColor) -> Self {
        Self {
            instruction_type,
            condition: Some(condition),
        }
    }

    /// Check if this instruction should execute given the current tile color
    pub fn should_execute(&self, tile_color: Option<TileColor>) -> bool {
        match self.condition {
            None => true, // Unconditional always executes
            Some(cond) => tile_color == Some(cond),
        }
    }

    /// Check if this is a noop (or effectively a noop)
    pub fn is_noop(&self) -> bool {
        self.instruction_type == InstructionType::Noop
    }
}

/// A tile on the grid
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tile {
    pub color: Option<TileColor>,
    #[serde(rename = "hasStar")]
    pub has_star: bool,
}

impl Tile {
    pub fn new(color: TileColor, has_star: bool) -> Self {
        Self {
            color: Some(color),
            has_star,
        }
    }
}

/// Position on the grid
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

impl Position {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }
}

/// Robot starting state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobotStart {
    pub position: Position,
    pub direction: Direction,
}

/// Function lengths configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionLengths {
    pub f1: usize,
    pub f2: usize,
    pub f3: usize,
    pub f4: usize,
    pub f5: usize,
}

impl FunctionLengths {
    pub fn get(&self, index: usize) -> usize {
        match index {
            0 => self.f1,
            1 => self.f2,
            2 => self.f3,
            3 => self.f4,
            4 => self.f5,
            _ => 0,
        }
    }

    pub fn total_slots(&self) -> usize {
        self.f1 + self.f2 + self.f3 + self.f4 + self.f5
    }
}

/// A program consisting of up to 5 functions
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Program {
    pub f1: Vec<Option<Instruction>>,
    pub f2: Vec<Option<Instruction>>,
    pub f3: Vec<Option<Instruction>>,
    pub f4: Vec<Option<Instruction>>,
    pub f5: Vec<Option<Instruction>>,
}

impl Program {
    /// Create a new empty program
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a program with specified function lengths (filled with None)
    pub fn with_lengths(lengths: &FunctionLengths) -> Self {
        Self {
            f1: vec![None; lengths.f1],
            f2: vec![None; lengths.f2],
            f3: vec![None; lengths.f3],
            f4: vec![None; lengths.f4],
            f5: vec![None; lengths.f5],
        }
    }

    /// Get a function by index (0-4)
    pub fn get_function(&self, index: usize) -> &[Option<Instruction>] {
        match index {
            0 => &self.f1,
            1 => &self.f2,
            2 => &self.f3,
            3 => &self.f4,
            4 => &self.f5,
            _ => &[],
        }
    }

    /// Get a mutable function by index (0-4)
    pub fn get_function_mut(&mut self, index: usize) -> &mut Vec<Option<Instruction>> {
        match index {
            0 => &mut self.f1,
            1 => &mut self.f2,
            2 => &mut self.f3,
            3 => &mut self.f4,
            _ => &mut self.f5,
        }
    }

    /// Count non-null instructions
    pub fn count_instructions(&self) -> usize {
        let mut count = 0;
        for func in [&self.f1, &self.f2, &self.f3, &self.f4, &self.f5] {
            for inst in func {
                if inst.is_some() {
                    count += 1;
                }
            }
        }
        count
    }

    /// Get instruction at a specific position
    pub fn get(&self, func_index: usize, inst_index: usize) -> Option<&Instruction> {
        self.get_function(func_index)
            .get(inst_index)
            .and_then(|opt| opt.as_ref())
    }

    /// Set instruction at a specific position
    pub fn set(&mut self, func_index: usize, inst_index: usize, instruction: Option<Instruction>) {
        let func = self.get_function_mut(func_index);
        if inst_index < func.len() {
            func[inst_index] = instruction;
        }
    }

    /// Find the first empty (None) slot in the program
    /// Returns (function_index, instruction_index) or None if program is full
    pub fn find_empty_slot(&self) -> Option<(usize, usize)> {
        for (func_idx, func) in [&self.f1, &self.f2, &self.f3, &self.f4, &self.f5]
            .iter()
            .enumerate()
        {
            for (inst_idx, inst) in func.iter().enumerate() {
                if inst.is_none() {
                    return Some((func_idx, inst_idx));
                }
            }
        }
        None
    }

    /// Check if the program has any empty slots
    pub fn has_empty_slots(&self) -> bool {
        self.find_empty_slot().is_some()
    }

    /// Clone with a modification at a specific position
    pub fn with_instruction(
        &self,
        func_index: usize,
        inst_index: usize,
        instruction: Option<Instruction>,
    ) -> Self {
        let mut new_program = self.clone();
        new_program.set(func_index, inst_index, instruction);
        new_program
    }
}

/// The complete puzzle configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PuzzleConfig {
    pub id: String,
    pub title: String,
    pub grid: Vec<Vec<Option<Tile>>>,
    #[serde(rename = "robotStart")]
    pub robot_start: RobotStart,
    #[serde(rename = "functionLengths")]
    pub function_lengths: FunctionLengths,
    #[serde(rename = "allowedInstructions")]
    pub allowed_instructions: Vec<InstructionType>,
    // Optional fields that may be present
    #[serde(default)]
    pub solution: Option<Program>,
}

impl PuzzleConfig {
    /// Get the tile at a position (bounds-checked)
    pub fn get_tile(&self, x: i32, y: i32) -> Option<&Tile> {
        if y < 0 || x < 0 {
            return None;
        }
        self.grid
            .get(y as usize)
            .and_then(|row| row.get(x as usize))
            .and_then(|opt| opt.as_ref())
    }

    /// Count total stars in the puzzle
    pub fn count_stars(&self) -> usize {
        let mut count = 0;
        for row in &self.grid {
            for tile in row {
                if let Some(t) = tile {
                    if t.has_star {
                        count += 1;
                    }
                }
            }
        }
        count
    }

    /// Get available colors in the puzzle
    pub fn available_colors(&self) -> Vec<TileColor> {
        let mut colors = std::collections::HashSet::new();
        for row in &self.grid {
            for tile in row {
                if let Some(t) = tile {
                    if let Some(c) = t.color {
                        colors.insert(c);
                    }
                }
            }
        }
        colors.into_iter().collect()
    }

    /// Check if a paint instruction is allowed
    pub fn allows_paint(&self, color: TileColor) -> bool {
        let paint_type = match color {
            TileColor::Red => InstructionType::PaintRed,
            TileColor::Green => InstructionType::PaintGreen,
            TileColor::Blue => InstructionType::PaintBlue,
        };
        self.allowed_instructions.contains(&paint_type)
    }

    /// Get the valid instructions for this puzzle given a tile color condition
    pub fn get_valid_instructions(&self, for_color: Option<TileColor>) -> Vec<Instruction> {
        let mut instructions = Vec::new();

        // For each allowed instruction type
        for &inst_type in &self.allowed_instructions {
            // Add unconditional version
            instructions.push(Instruction::new(inst_type));

            // Add conditional versions for each available color
            // (only if puzzle has multiple colors or conditionals make sense)
            for &color in &self.available_colors() {
                // Skip if this is a paint instruction to the same color
                if let Some(paint_color) = inst_type.paint_color() {
                    if paint_color == color {
                        continue;
                    }
                }
                instructions.push(Instruction::with_condition(inst_type, color));
            }
        }

        instructions
    }
}

/// Minimum constraints for a solution to be considered non-trivial
#[derive(Debug, Clone)]
pub struct MinConstraints {
    pub instructions: usize, // Min 4 non-null instructions
    pub steps: usize,        // Min 16 execution steps
    pub recursion_depth: usize, // Min 3 stack depth
    pub conditionals: usize, // Min 2 conditional executions
    pub step_ratio: f32,     // Min 3.0 steps per instruction
}

impl Default for MinConstraints {
    fn default() -> Self {
        Self {
            instructions: 4,
            steps: 16,
            recursion_depth: 3,
            conditionals: 2,
            step_ratio: 3.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_direction_turns() {
        assert_eq!(Direction::Up.turn_left(), Direction::Left);
        assert_eq!(Direction::Left.turn_left(), Direction::Down);
        assert_eq!(Direction::Down.turn_left(), Direction::Right);
        assert_eq!(Direction::Right.turn_left(), Direction::Up);

        assert_eq!(Direction::Up.turn_right(), Direction::Right);
        assert_eq!(Direction::Right.turn_right(), Direction::Down);
        assert_eq!(Direction::Down.turn_right(), Direction::Left);
        assert_eq!(Direction::Left.turn_right(), Direction::Up);
    }

    #[test]
    fn test_instruction_should_execute() {
        let unconditional = Instruction::new(InstructionType::Forward);
        assert!(unconditional.should_execute(Some(TileColor::Red)));
        assert!(unconditional.should_execute(Some(TileColor::Blue)));
        assert!(unconditional.should_execute(None));

        let red_only = Instruction::with_condition(InstructionType::Forward, TileColor::Red);
        assert!(red_only.should_execute(Some(TileColor::Red)));
        assert!(!red_only.should_execute(Some(TileColor::Blue)));
        assert!(!red_only.should_execute(None));
    }

    #[test]
    fn test_program_count_instructions() {
        let mut program = Program::new();
        program.f1 = vec![
            Some(Instruction::new(InstructionType::Forward)),
            Some(Instruction::new(InstructionType::Left)),
            None,
        ];
        program.f2 = vec![Some(Instruction::new(InstructionType::F1)), None];

        assert_eq!(program.count_instructions(), 3);
    }
}
