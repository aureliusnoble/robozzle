//! CLI entry point for the puzzle verifier.
//!
//! Usage:
//!   puzzle-verifier verify <puzzle.json> [options]
//!   puzzle-verifier verify --stdin [options]
//!
//! Options:
//!   --timeout <seconds>     Maximum search time (default: 15)
//!   --max-steps <n>         Maximum execution steps (default: 200)
//!   --max-instructions <n>  Maximum solution instructions (default: 16)
//!   --min-instructions <n>  Minimum instructions for non-trivial (default: 4)
//!   --min-steps <n>         Minimum steps for non-trivial (default: 16)
//!   --min-recursion <n>     Minimum stack depth for non-trivial (default: 3)
//!   --min-conditionals <n>  Minimum conditionals for non-trivial (default: 2)
//!   --min-step-ratio <f>    Minimum step:instruction ratio (default: 3.0)

mod executor;
mod pruning;
mod puzzle;
mod solver;

use std::fs;
use std::io::{self, Read};
use std::path::PathBuf;
use std::time::Duration;

use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};

use puzzle::{MinConstraints, PuzzleConfig};
use solver::{find_trivial_solution, SolverConfig, SolverResult};

#[derive(Parser)]
#[command(name = "puzzle-verifier")]
#[command(about = "Fast bounded solver for Robozzle puzzle verification")]
#[command(version)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Verify a puzzle has no trivial alternative solutions
    Verify {
        /// Path to puzzle JSON file (use --stdin to read from stdin)
        #[arg(value_name = "FILE")]
        file: Option<PathBuf>,

        /// Read puzzle from stdin instead of file
        #[arg(long)]
        stdin: bool,

        /// Maximum search time in seconds
        #[arg(long, default_value = "15")]
        timeout: u64,

        /// Maximum execution steps per program
        #[arg(long, default_value = "200")]
        max_steps: usize,

        /// Maximum instructions in a solution
        #[arg(long, default_value = "16")]
        max_instructions: usize,

        /// Minimum instructions for non-trivial solution
        #[arg(long, default_value = "4")]
        min_instructions: usize,

        /// Minimum steps for non-trivial solution
        #[arg(long, default_value = "16")]
        min_steps: usize,

        /// Minimum recursion depth for non-trivial solution
        #[arg(long, default_value = "3")]
        min_recursion: usize,

        /// Minimum conditionals executed for non-trivial solution
        #[arg(long, default_value = "2")]
        min_conditionals: usize,

        /// Minimum step:instruction ratio for non-trivial solution
        #[arg(long, default_value = "3.0")]
        min_step_ratio: f32,
    },
}

/// Output format for verification result
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerificationOutput {
    valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
    search_exhausted: bool,
    programs_tested: usize,
    time_elapsed_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    alternative_solution: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    alternative_metrics: Option<MetricsOutput>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetricsOutput {
    steps: usize,
    instructions: usize,
    recursion_depth: usize,
    conditionals: usize,
    step_ratio: f32,
}

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Verify {
            file,
            stdin,
            timeout,
            max_steps,
            max_instructions,
            min_instructions,
            min_steps,
            min_recursion,
            min_conditionals,
            min_step_ratio,
        } => {
            // Read puzzle JSON
            let json_content = if stdin {
                let mut buffer = String::new();
                io::stdin()
                    .read_to_string(&mut buffer)
                    .expect("Failed to read from stdin");
                buffer
            } else if let Some(path) = file {
                fs::read_to_string(&path)
                    .unwrap_or_else(|e| panic!("Failed to read file {:?}: {}", path, e))
            } else {
                eprintln!("Error: Must provide either a file path or --stdin");
                std::process::exit(1);
            };

            // Parse puzzle
            let puzzle: PuzzleConfig = match serde_json::from_str(&json_content) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("Error parsing puzzle JSON: {}", e);
                    std::process::exit(1);
                }
            };

            // Build solver config
            let config = SolverConfig {
                timeout: Duration::from_secs(timeout),
                max_steps,
                max_instructions,
                min_constraints: MinConstraints {
                    instructions: min_instructions,
                    steps: min_steps,
                    recursion_depth: min_recursion,
                    conditionals: min_conditionals,
                    step_ratio: min_step_ratio,
                },
            };

            // Run solver
            let result = find_trivial_solution(&puzzle, &config);

            // Format output
            let output = format_result(&result);

            // Print JSON output
            println!("{}", serde_json::to_string_pretty(&output).unwrap());

            // Exit with appropriate code
            if result.valid {
                std::process::exit(0);
            } else {
                std::process::exit(1);
            }
        }
    }
}

fn format_result(result: &SolverResult) -> VerificationOutput {
    VerificationOutput {
        valid: result.valid,
        reason: if result.valid {
            None
        } else {
            Some(result.reason.clone().unwrap_or_else(|| "trivial_solution_found".to_string()))
        },
        search_exhausted: result.search_exhausted,
        programs_tested: result.programs_tested,
        time_elapsed_ms: result.time_elapsed_ms,
        alternative_solution: result
            .trivial_solution
            .as_ref()
            .map(|s| serde_json::to_value(s).unwrap()),
        alternative_metrics: result.trivial_metrics.as_ref().map(|m| MetricsOutput {
            steps: m.steps,
            instructions: m.instructions,
            recursion_depth: m.max_stack_depth,
            conditionals: m.conditionals_executed,
            step_ratio: m.step_ratio(),
        }),
    }
}
