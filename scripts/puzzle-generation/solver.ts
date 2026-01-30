// Evolutionary algorithm solver for Robozzle puzzles

import type { FunctionName, Instruction, InstructionType, Program, PuzzleConfig, TileColor } from '../../src/engine/types';
import type { FitnessResult, Individual, SolverConfig, SolverResult } from './types';
import { DEFAULT_SOLVER_CONFIG, INSTRUCTION_WEIGHTS } from './config';
import { evaluateFitness, quickEvaluate } from './fitness';

// Seeded random number generator for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  // Linear congruential generator
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  // Random integer in range [0, max)
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  // Random element from array
  choice<T>(arr: T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  // Weighted random selection
  weightedChoice<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = this.next() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

// Generate a random instruction from allowed instructions
function randomInstruction(
  allowedInstructions: InstructionType[],
  colors: TileColor[],
  rng: SeededRandom
): Instruction | null {
  // 20% chance of null (empty slot)
  if (rng.next() < 0.2) return null;

  // Select instruction type based on weights
  const weights = allowedInstructions.map(
    inst => INSTRUCTION_WEIGHTS[inst] || 1
  );
  const type = rng.weightedChoice(allowedInstructions, weights);

  // 40% chance of adding a color condition
  let condition: TileColor | null = null;
  if (rng.next() < 0.4 && colors.length > 0) {
    condition = rng.choice(colors);
  }

  return { type, condition };
}

// Generate a random program for a puzzle
function randomProgram(puzzle: PuzzleConfig, rng: SeededRandom): Program {
  // Find all colors in the puzzle
  const colors = new Set<TileColor>();
  for (const row of puzzle.grid) {
    for (const tile of row) {
      if (tile?.color) colors.add(tile.color);
    }
  }
  const colorList = Array.from(colors);

  const program: Program = {
    f1: [],
    f2: [],
    f3: [],
    f4: [],
    f5: [],
  };

  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    const length = puzzle.functionLengths[funcName];
    program[funcName] = [];
    for (let i = 0; i < length; i++) {
      program[funcName].push(
        randomInstruction(puzzle.allowedInstructions, colorList, rng)
      );
    }
  }

  return program;
}

// Deep clone a program
function cloneProgram(program: Program): Program {
  return {
    f1: program.f1.map(i => i ? { ...i } : null),
    f2: program.f2.map(i => i ? { ...i } : null),
    f3: program.f3.map(i => i ? { ...i } : null),
    f4: program.f4.map(i => i ? { ...i } : null),
    f5: program.f5.map(i => i ? { ...i } : null),
  };
}

// Mutate a program
function mutate(
  program: Program,
  puzzle: PuzzleConfig,
  mutationRate: number,
  rng: SeededRandom
): Program {
  const mutated = cloneProgram(program);

  // Find colors
  const colors = new Set<TileColor>();
  for (const row of puzzle.grid) {
    for (const tile of row) {
      if (tile?.color) colors.add(tile.color);
    }
  }
  const colorList = Array.from(colors);

  // Apply mutations
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (let i = 0; i < mutated[funcName].length; i++) {
      if (rng.next() < mutationRate) {
        // Choose mutation type
        const mutationType = rng.nextInt(5);

        switch (mutationType) {
          case 0:
            // Replace instruction
            mutated[funcName][i] = randomInstruction(
              puzzle.allowedInstructions,
              colorList,
              rng
            );
            break;

          case 1:
            // Clear slot
            mutated[funcName][i] = null;
            break;

          case 2:
            // Swap with adjacent
            if (i < mutated[funcName].length - 1) {
              const temp = mutated[funcName][i];
              mutated[funcName][i] = mutated[funcName][i + 1];
              mutated[funcName][i + 1] = temp;
            }
            break;

          case 3:
            // Toggle/change condition
            if (mutated[funcName][i]) {
              const inst = mutated[funcName][i]!;
              if (inst.condition === null && colorList.length > 0) {
                inst.condition = rng.choice(colorList);
              } else if (inst.condition !== null) {
                // 50% clear, 50% change
                if (rng.next() < 0.5) {
                  inst.condition = null;
                } else if (colorList.length > 0) {
                  inst.condition = rng.choice(colorList);
                }
              }
            }
            break;

          case 4:
            // Change instruction type (keep condition)
            if (mutated[funcName][i]) {
              const newType = rng.choice(puzzle.allowedInstructions);
              mutated[funcName][i] = {
                type: newType,
                condition: mutated[funcName][i]!.condition,
              };
            }
            break;
        }
      }
    }
  }

  return mutated;
}

// Single-point crossover per function
function crossover(
  parent1: Program,
  parent2: Program,
  puzzle: PuzzleConfig,
  rng: SeededRandom
): [Program, Program] {
  const child1 = cloneProgram(parent1);
  const child2 = cloneProgram(parent2);

  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    const length = puzzle.functionLengths[funcName];
    if (length > 1) {
      // Choose crossover point
      const point = rng.nextInt(length - 1) + 1;

      // Swap after crossover point
      for (let i = point; i < length; i++) {
        const temp = child1[funcName][i];
        child1[funcName][i] = child2[funcName][i];
        child2[funcName][i] = temp;
      }
    }
  }

  return [child1, child2];
}

// Tournament selection
function tournamentSelect(
  population: Individual[],
  tournamentSize: number,
  rng: SeededRandom
): Individual {
  let best: Individual | null = null;

  for (let i = 0; i < tournamentSize; i++) {
    const candidate = rng.choice(population);
    if (best === null || candidate.fitness.total > best.fitness.total) {
      best = candidate;
    }
  }

  return best!;
}

// Main solver function
export function solve(
  puzzle: PuzzleConfig,
  config: Partial<SolverConfig> = {},
  seed?: number
): SolverResult {
  const cfg: SolverConfig = { ...DEFAULT_SOLVER_CONFIG, ...config };
  const rng = new SeededRandom(seed);

  // Initialize population
  let population: Individual[] = [];
  for (let i = 0; i < cfg.populationSize; i++) {
    const program = randomProgram(puzzle, rng);
    const fitness = evaluateFitness(puzzle, program);
    population.push({ program, fitness });

    // Early exit if we find a solution
    if (fitness.solved) {
      return {
        solved: true,
        solution: program,
        fitness,
        generations: 0,
        totalEvaluations: i + 1,
        bestFitnessHistory: [fitness.total],
      };
    }
  }

  // Sort by fitness
  population.sort((a, b) => b.fitness.total - a.fitness.total);

  const bestFitnessHistory: number[] = [population[0].fitness.total];
  let stagnationCounter = 0;
  let bestFitness = population[0].fitness.total;
  let totalEvaluations = cfg.populationSize;

  // Evolution loop
  for (let gen = 0; gen < cfg.maxGenerations; gen++) {
    const newPopulation: Individual[] = [];

    // Elitism: keep top individuals
    for (let i = 0; i < cfg.eliteCount && i < population.length; i++) {
      newPopulation.push({
        program: cloneProgram(population[i].program),
        fitness: population[i].fitness,
      });
    }

    // Generate rest of population
    while (newPopulation.length < cfg.populationSize) {
      // Selection
      const parent1 = tournamentSelect(population, cfg.tournamentSize, rng);
      const parent2 = tournamentSelect(population, cfg.tournamentSize, rng);

      let offspring1: Program;
      let offspring2: Program;

      // Crossover
      if (rng.next() < cfg.crossoverRate) {
        [offspring1, offspring2] = crossover(
          parent1.program,
          parent2.program,
          puzzle,
          rng
        );
      } else {
        offspring1 = cloneProgram(parent1.program);
        offspring2 = cloneProgram(parent2.program);
      }

      // Mutation
      offspring1 = mutate(offspring1, puzzle, cfg.mutationRate, rng);
      offspring2 = mutate(offspring2, puzzle, cfg.mutationRate, rng);

      // Evaluate
      for (const offspring of [offspring1, offspring2]) {
        if (newPopulation.length >= cfg.populationSize) break;

        const fitness = evaluateFitness(puzzle, offspring);
        totalEvaluations++;

        newPopulation.push({ program: offspring, fitness });

        // Check for solution
        if (fitness.solved) {
          return {
            solved: true,
            solution: offspring,
            fitness,
            generations: gen + 1,
            totalEvaluations,
            bestFitnessHistory,
          };
        }
      }
    }

    // Replace population
    population = newPopulation;
    population.sort((a, b) => b.fitness.total - a.fitness.total);

    const currentBest = population[0].fitness.total;
    bestFitnessHistory.push(currentBest);

    // Check for improvement
    if (currentBest > bestFitness) {
      bestFitness = currentBest;
      stagnationCounter = 0;
    } else {
      stagnationCounter++;
    }

    // Check stagnation limit
    if (stagnationCounter >= cfg.stagnationLimit) {
      break;
    }
  }

  // Return best found (even if not a solution)
  return {
    solved: false,
    solution: null,
    fitness: population[0].fitness,
    generations: bestFitnessHistory.length,
    totalEvaluations,
    bestFitnessHistory,
  };
}

// Verify a solution works
export function verifySolution(puzzle: PuzzleConfig, program: Program): boolean {
  return quickEvaluate(puzzle, program).solved;
}

// Find multiple solutions (for uniqueness scoring)
export function findMultipleSolutions(
  puzzle: PuzzleConfig,
  maxSolutions: number = 5,
  maxAttempts: number = 10,
  seed?: number
): Program[] {
  const solutions: Program[] = [];
  const solutionStrings = new Set<string>();

  for (let attempt = 0; attempt < maxAttempts && solutions.length < maxSolutions; attempt++) {
    const result = solve(puzzle, {}, seed ? seed + attempt * 1000 : undefined);

    if (result.solved && result.solution) {
      // Check if this is a unique solution
      const solStr = JSON.stringify(result.solution);
      if (!solutionStrings.has(solStr)) {
        solutionStrings.add(solStr);
        solutions.push(result.solution);
      }
    }
  }

  return solutions;
}
