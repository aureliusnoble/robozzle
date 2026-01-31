//! Search space pruning rules for the solver.
//!
//! These rules detect instruction sequences that can never lead to valid
//! solutions, allowing the solver to skip large portions of the search space.
//!
//! Adapted from RobozzleSolver's pruning.rs

use crate::puzzle::{Instruction, InstructionType, Program, PuzzleConfig, TileColor};

/// Check if an instruction pair is banned (can never be useful)
pub fn is_banned_pair(a: &Instruction, b: &Instruction, puzzle: &PuzzleConfig) -> bool {
    // Skip if either is noop
    if a.instruction_type == InstructionType::Noop || b.instruction_type == InstructionType::Noop {
        return false;
    }

    // Rule 1: Two consecutive turns with the same condition that sum to 360°
    // left-left-left-left, right-right-right-right are banned (but not in pairs, needs trio check)
    // left-right with same condition is banned (no-op)
    if a.condition == b.condition && a.instruction_type.is_turn() && b.instruction_type.is_turn() {
        // left-right or right-left with same condition = no-op
        if (a.instruction_type == InstructionType::Left
            && b.instruction_type == InstructionType::Right)
            || (a.instruction_type == InstructionType::Right
                && b.instruction_type == InstructionType::Left)
        {
            return true;
        }
    }

    // Rule 2: Two consecutive paints with same condition
    // Painting twice in a row with same condition is wasteful
    if a.condition == b.condition && a.instruction_type.is_paint() && b.instruction_type.is_paint()
    {
        return true;
    }

    // Rule 3: Unconditional paint followed by conditional paint to same color
    // e.g., paint_red followed by red:paint_green - the red condition will always be true
    if a.condition.is_none() && a.instruction_type.is_paint() {
        if let Some(paint_color) = a.instruction_type.paint_color() {
            if b.condition == Some(paint_color) && b.instruction_type.is_paint() {
                return true;
            }
        }
    }

    // Rule 4: Two turns in a row should be ordered canonically to avoid duplicates
    // We enforce: left before right when conditions are the same
    if a.instruction_type.is_turn() && b.instruction_type.is_turn() {
        if a.condition == b.condition {
            // Enforce ordering: left < right
            if a.instruction_type == InstructionType::Right
                && b.instruction_type == InstructionType::Left
            {
                return true;
            }
        }
    }

    // Rule 5: Conditional instruction followed by same instruction with different condition
    // that negates it when only 2 colors exist
    // e.g., on 2-color puzzle: red:left followed by green:right = unconditional (but more complex)
    // This is too restrictive for general case, skip

    // Rule 6: Paint to color X followed by condition on color X for same paint
    // e.g., paint_red, red:paint_red - second is no-op after first
    if a.instruction_type.is_paint() {
        if let Some(paint_color) = a.instruction_type.paint_color() {
            if b.condition == Some(paint_color)
                && b.instruction_type == a.instruction_type
            {
                return true;
            }
        }
    }

    false
}

/// Check if an instruction trio is banned
pub fn is_banned_trio(
    a: &Instruction,
    b: &Instruction,
    c: &Instruction,
    puzzle: &PuzzleConfig,
) -> bool {
    // First check if any pair is banned
    if is_banned_pair(a, b, puzzle) || is_banned_pair(b, c, puzzle) {
        return true;
    }

    // Rule: Three turns with same condition that result in single turn
    // left-left-left = right, right-right-right = left
    if a.condition == b.condition
        && b.condition == c.condition
        && a.instruction_type.is_turn()
        && b.instruction_type.is_turn()
        && c.instruction_type.is_turn()
    {
        // Three lefts or three rights
        if a.instruction_type == b.instruction_type && b.instruction_type == c.instruction_type {
            return true;
        }
    }

    // Rule: paint followed by order-invariant instruction followed by conditional on paint color
    // that doesn't match the paint color
    // e.g., paint_red, left, green:forward - the green condition will never be true if we just painted red
    if a.instruction_type.is_paint() && a.condition.is_none() {
        if let Some(paint_color) = a.instruction_type.paint_color() {
            if (b.instruction_type.is_turn() || b.instruction_type == InstructionType::Noop) {
                if let Some(cond) = c.condition {
                    if cond != paint_color {
                        return true;
                    }
                }
            }
        }
    }

    false
}

/// Check if a program should be rejected based on structural rules
pub fn should_reject_program(program: &Program, puzzle: &PuzzleConfig) -> bool {
    // Check each function for banned sequences
    for func_idx in 0..5 {
        let func = program.get_function(func_idx);

        // Get non-None instructions
        let instructions: Vec<&Instruction> = func.iter().filter_map(|i| i.as_ref()).collect();

        // Check pairs
        for i in 0..instructions.len().saturating_sub(1) {
            if is_banned_pair(instructions[i], instructions[i + 1], puzzle) {
                return true;
            }
        }

        // Check trios
        for i in 0..instructions.len().saturating_sub(2) {
            if is_banned_trio(
                instructions[i],
                instructions[i + 1],
                instructions[i + 2],
                puzzle,
            ) {
                return true;
            }
        }
    }

    // Check for unreachable functions
    // A function is unreachable if it's non-empty but never called
    let mut called_functions = [false; 5];
    called_functions[0] = true; // F1 is always called

    for func_idx in 0..5 {
        let func = program.get_function(func_idx);
        for inst in func.iter().filter_map(|i| i.as_ref()) {
            if let Some(target) = inst.instruction_type.function_index() {
                called_functions[target] = true;
            }
        }
    }

    // Check if any non-empty function is unreachable
    for func_idx in 0..5 {
        let func = program.get_function(func_idx);
        let has_instructions = func.iter().any(|i| i.is_some());
        if has_instructions && !called_functions[func_idx] {
            return true;
        }
    }

    // Check for invalid conditionals
    // A conditional on a color that doesn't exist in the puzzle is useless
    let available_colors = puzzle.available_colors();
    for func_idx in 0..5 {
        let func = program.get_function(func_idx);
        for inst in func.iter().filter_map(|i| i.as_ref()) {
            if let Some(cond) = inst.condition {
                if !available_colors.contains(&cond) {
                    return true;
                }
            }
        }
    }

    // Check for calling empty functions
    for func_idx in 0..5 {
        let func = program.get_function(func_idx);
        for inst in func.iter().filter_map(|i| i.as_ref()) {
            if let Some(target) = inst.instruction_type.function_index() {
                let target_func = program.get_function(target);
                let target_has_instructions = target_func.iter().any(|i| i.is_some());
                if !target_has_instructions {
                    return true;
                }
            }
        }
    }

    // Check for unconditional self-recursion at end of function (infinite loop)
    // e.g., F1 = [forward, F1] - will loop forever unless forward fails
    // This is actually valid in some cases, so we don't ban it outright

    false
}

/// Get valid instructions that can be placed at a given slot
pub fn get_valid_instructions_for_slot(
    program: &Program,
    func_index: usize,
    inst_index: usize,
    puzzle: &PuzzleConfig,
) -> Vec<Instruction> {
    let mut valid = Vec::new();
    let available_colors = puzzle.available_colors();

    // Get the previous instruction in this function (if any)
    let prev_inst = if inst_index > 0 {
        program.get(func_index, inst_index - 1)
    } else {
        None
    };

    // For each allowed instruction type
    for &inst_type in &puzzle.allowed_instructions {
        // Add unconditional version
        let unconditional = Instruction::new(inst_type);
        if !prev_inst.map_or(false, |prev| is_banned_pair(prev, &unconditional, puzzle)) {
            valid.push(unconditional);
        }

        // Add conditional versions
        for &color in &available_colors {
            // Skip paint instructions with condition matching the paint color
            if let Some(paint_color) = inst_type.paint_color() {
                if paint_color == color {
                    continue;
                }
            }

            let conditional = Instruction::with_condition(inst_type, color);
            if !prev_inst.map_or(false, |prev| is_banned_pair(prev, &conditional, puzzle)) {
                valid.push(conditional);
            }
        }
    }

    valid
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_puzzle() -> PuzzleConfig {
        PuzzleConfig {
            id: "test".to_string(),
            title: "Test".to_string(),
            grid: vec![vec![Some(crate::puzzle::Tile {
                color: Some(TileColor::Red),
                has_star: false,
            })]],
            robot_start: crate::puzzle::RobotStart {
                position: crate::puzzle::Position::new(0, 0),
                direction: crate::puzzle::Direction::Right,
            },
            function_lengths: crate::puzzle::FunctionLengths {
                f1: 5,
                f2: 5,
                f3: 0,
                f4: 0,
                f5: 0,
            },
            allowed_instructions: vec![
                InstructionType::Forward,
                InstructionType::Left,
                InstructionType::Right,
                InstructionType::F1,
                InstructionType::F2,
            ],
            solution: None,
        }
    }

    #[test]
    fn test_left_right_banned() {
        let puzzle = create_test_puzzle();
        let left = Instruction::new(InstructionType::Left);
        let right = Instruction::new(InstructionType::Right);

        assert!(is_banned_pair(&left, &right, &puzzle));
        assert!(is_banned_pair(&right, &left, &puzzle));
    }

    #[test]
    fn test_conditional_left_right_different_conditions_not_banned() {
        let puzzle = create_test_puzzle();
        let red_left = Instruction::with_condition(InstructionType::Left, TileColor::Red);
        let blue_right = Instruction::with_condition(InstructionType::Right, TileColor::Blue);

        assert!(!is_banned_pair(&red_left, &blue_right, &puzzle));
    }

    #[test]
    fn test_triple_turn_banned() {
        let puzzle = create_test_puzzle();
        let left1 = Instruction::new(InstructionType::Left);
        let left2 = Instruction::new(InstructionType::Left);
        let left3 = Instruction::new(InstructionType::Left);

        assert!(is_banned_trio(&left1, &left2, &left3, &puzzle));
    }

    #[test]
    fn test_reject_unreachable_function() {
        let puzzle = create_test_puzzle();
        let mut program = Program::new();
        program.f1 = vec![Some(Instruction::new(InstructionType::Forward))];
        // F2 has instructions but is never called
        program.f2 = vec![Some(Instruction::new(InstructionType::Left))];

        assert!(should_reject_program(&program, &puzzle));
    }

    #[test]
    fn test_accept_valid_program() {
        let puzzle = create_test_puzzle();
        let mut program = Program::new();
        program.f1 = vec![
            Some(Instruction::new(InstructionType::Forward)),
            Some(Instruction::new(InstructionType::F2)),
        ];
        program.f2 = vec![Some(Instruction::new(InstructionType::Left))];

        assert!(!should_reject_program(&program, &puzzle));
    }
}
