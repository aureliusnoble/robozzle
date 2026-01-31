//! Puzzle verifier library for Robozzle puzzle generation.
//!
//! This crate provides a fast, bounded solver that can verify whether
//! a puzzle has trivial solutions. It's used by the puzzle generator
//! to ensure generated puzzles are interesting.

pub mod executor;
pub mod pruning;
pub mod puzzle;
pub mod solver;

// Re-export main types
pub use executor::{execute, verify_solution, ExecutionMetrics, ExecutionResult, ExecutionStatus};
pub use puzzle::{
    Direction, FunctionLengths, Instruction, InstructionType, MinConstraints, Position, Program,
    PuzzleConfig, RobotStart, Tile, TileColor,
};
pub use solver::{find_trivial_solution, SolverConfig, SolverResult};
