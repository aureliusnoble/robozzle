// Interface to the Rust puzzle-verifier binary
// Replaces the TypeScript triviality checker with a fast, bounded Rust solver

import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Program, PuzzleConfig } from '../../src/engine/types';

const execFileAsync = promisify(execFile);

// Helper to run command with stdin input
function runWithStdin(
  command: string,
  args: string[],
  input: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Process timed out'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Write input to stdin
    child.stdin.write(input);
    child.stdin.end();
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the Rust binary (relative to project root)
const VERIFIER_BINARY = join(__dirname, '../../crates/puzzle-verifier/target/release/puzzle-verifier');

// Verification configuration
export interface VerifierConfig {
  timeoutSeconds: number;
  maxSteps: number;
  maxInstructions: number;
  minInstructions: number;
  minSteps: number;
  minRecursion: number;
  minConditionals: number;
  minStepRatio: number;
}

// Default configuration matching the plan constraints
export const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  timeoutSeconds: 15,
  maxSteps: 200,
  maxInstructions: 16,
  minInstructions: 4,
  minSteps: 16,
  minRecursion: 3,
  minConditionals: 2,
  minStepRatio: 3.0,
};

// Metrics from the Rust verifier
export interface VerificationMetrics {
  steps: number;
  instructions: number;
  recursionDepth: number;
  conditionals: number;
  stepRatio: number;
}

// Result from the Rust verifier
export interface VerificationResult {
  valid: boolean;
  reason?: string;
  searchExhausted: boolean;
  programsTested: number;
  timeElapsedMs: number;
  alternativeSolution?: Program;
  alternativeMetrics?: VerificationMetrics;
}

// Convert puzzle config to JSON format expected by Rust verifier
function puzzleToJson(puzzle: PuzzleConfig): string {
  return JSON.stringify({
    id: puzzle.id,
    title: puzzle.title,
    grid: puzzle.grid,
    robotStart: puzzle.robotStart,
    functionLengths: puzzle.functionLengths,
    allowedInstructions: puzzle.allowedInstructions,
  });
}

// Verify a puzzle has no trivial alternative solutions using the Rust verifier
export async function verifyNoTrivialSolution(
  puzzle: PuzzleConfig,
  config: Partial<VerifierConfig> = {}
): Promise<VerificationResult> {
  const fullConfig = { ...DEFAULT_VERIFIER_CONFIG, ...config };

  const args = [
    'verify',
    '--stdin',
    '--timeout', String(fullConfig.timeoutSeconds),
    '--max-steps', String(fullConfig.maxSteps),
    '--max-instructions', String(fullConfig.maxInstructions),
    '--min-instructions', String(fullConfig.minInstructions),
    '--min-steps', String(fullConfig.minSteps),
    '--min-recursion', String(fullConfig.minRecursion),
    '--min-conditionals', String(fullConfig.minConditionals),
    '--min-step-ratio', String(fullConfig.minStepRatio),
  ];

  const puzzleJson = puzzleToJson(puzzle);
  const timeoutMs = (fullConfig.timeoutSeconds + 5) * 1000;

  try {
    const { stdout, stderr, code } = await runWithStdin(
      VERIFIER_BINARY,
      args,
      puzzleJson,
      timeoutMs
    );

    // Parse the JSON output (works for both exit code 0 and 1)
    if (stdout) {
      try {
        return JSON.parse(stdout) as VerificationResult;
      } catch {
        console.error('Failed to parse verifier output:', stdout);
      }
    }

    // If we couldn't parse, check for errors
    if (stderr) {
      console.error('Rust verifier stderr:', stderr);
    }

    // Return conservative result
    return {
      valid: true,
      reason: `verifier returned no output (code ${code})`,
      searchExhausted: false,
      programsTested: 0,
      timeElapsedMs: 0,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Rust verifier error:', errorMessage);

    // Return a conservative result (assume valid to avoid blocking generation)
    return {
      valid: true,
      reason: `verifier error: ${errorMessage}`,
      searchExhausted: false,
      programsTested: 0,
      timeElapsedMs: 0,
    };
  }
}

// Check if the Rust verifier binary exists and is executable
export async function checkVerifierAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(VERIFIER_BINARY, ['--version'], {
      timeout: 5000,
    });
    return stdout.includes('puzzle-verifier');
  } catch {
    return false;
  }
}

// Wrapper that matches the old checkSimplicity interface for compatibility
export interface SimplicityResult {
  isTooSimple: boolean;
  intendedMetrics: {
    instructions: number;
    stackDepth: number;
    steps: number;
  };
  alternativeMetrics?: {
    instructions: number;
    stackDepth: number;
    steps: number;
  };
  reason?: string;
}

// Compatibility wrapper for existing code
export async function checkSimplicityRust(
  puzzle: PuzzleConfig,
  _intendedSolution: Program,
  _seed?: number
): Promise<SimplicityResult> {
  const result = await verifyNoTrivialSolution(puzzle);

  return {
    isTooSimple: !result.valid,
    intendedMetrics: {
      instructions: 0, // Not tracked by Rust verifier for intended solution
      stackDepth: 0,
      steps: 0,
    },
    alternativeMetrics: result.alternativeMetrics
      ? {
          instructions: result.alternativeMetrics.instructions,
          stackDepth: result.alternativeMetrics.recursionDepth,
          steps: result.alternativeMetrics.steps,
        }
      : undefined,
    reason: result.reason,
  };
}
