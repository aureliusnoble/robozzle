import type { PuzzleConfig, Program } from '../engine/types';
import type { SimulationConfig } from '../engine/simulationTypes';
import { supabase } from '../lib/supabase';

const SAVED_PUZZLES_KEY = 'robozzle_saved_puzzles';
const SAVED_CONFIGS_KEY = 'robozzle_saved_configs';

export interface SavedPuzzle {
  id: string;
  name: string;
  savedAt: number;
  puzzle: PuzzleConfig;
  program: Program;
}

export interface SavedConfig {
  id: string;
  name: string;
  savedAt: number;
  config: SimulationConfig;
}

// Puzzle storage functions
export function getSavedPuzzles(): SavedPuzzle[] {
  try {
    const data = localStorage.getItem(SAVED_PUZZLES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function savePuzzle(name: string, puzzle: PuzzleConfig, program: Program): SavedPuzzle {
  const puzzles = getSavedPuzzles();
  const newPuzzle: SavedPuzzle = {
    id: `puzzle-${Date.now()}`,
    name,
    savedAt: Date.now(),
    puzzle,
    program,
  };
  puzzles.unshift(newPuzzle); // Add to beginning
  localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(puzzles));
  return newPuzzle;
}

export function deleteSavedPuzzle(id: string): void {
  const puzzles = getSavedPuzzles().filter(p => p.id !== id);
  localStorage.setItem(SAVED_PUZZLES_KEY, JSON.stringify(puzzles));
}

// Config storage functions
export function getSavedConfigs(): SavedConfig[] {
  try {
    const data = localStorage.getItem(SAVED_CONFIGS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveConfig(name: string, config: SimulationConfig): SavedConfig {
  const configs = getSavedConfigs();
  const newConfig: SavedConfig = {
    id: `config-${Date.now()}`,
    name,
    savedAt: Date.now(),
    config,
  };
  configs.unshift(newConfig); // Add to beginning
  localStorage.setItem(SAVED_CONFIGS_KEY, JSON.stringify(configs));
  return newConfig;
}

export function deleteSavedConfig(id: string): void {
  const configs = getSavedConfigs().filter(c => c.id !== id);
  localStorage.setItem(SAVED_CONFIGS_KEY, JSON.stringify(configs));
}

// Supabase sync functions for configs

export async function fetchConfigsFromSupabase(userId: string): Promise<SavedConfig[]> {
  try {
    const { data, error } = await supabase
      .from('saved_simulation_configs')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false });

    if (error) {
      console.error('Error fetching configs from Supabase:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      name: row.name,
      savedAt: row.saved_at,
      config: row.config as SimulationConfig,
    }));
  } catch (err) {
    console.error('Error fetching configs from Supabase:', err);
    return [];
  }
}

export async function saveConfigToSupabase(userId: string, config: SavedConfig): Promise<void> {
  try {
    const { error } = await supabase
      .from('saved_simulation_configs')
      .upsert({
        id: config.id,
        user_id: userId,
        name: config.name,
        saved_at: config.savedAt,
        config: config.config as unknown as Record<string, unknown>,
      });

    if (error) {
      console.error('Error saving config to Supabase:', error);
    }
  } catch (err) {
    console.error('Error saving config to Supabase:', err);
  }
}

export async function deleteConfigFromSupabase(userId: string, configId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('saved_simulation_configs')
      .delete()
      .eq('id', configId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting config from Supabase:', error);
    }
  } catch (err) {
    console.error('Error deleting config from Supabase:', err);
  }
}

export function mergeConfigs(local: SavedConfig[], remote: SavedConfig[]): SavedConfig[] {
  const configMap = new Map<string, SavedConfig>();

  // Add remote configs first
  for (const config of remote) {
    configMap.set(config.id, config);
  }

  // Override with local configs (local wins if same ID exists)
  // or add local configs that don't exist remotely
  for (const config of local) {
    const existing = configMap.get(config.id);
    // Local wins if it's newer or doesn't exist remotely
    if (!existing || config.savedAt >= existing.savedAt) {
      configMap.set(config.id, config);
    }
  }

  // Sort by savedAt descending (most recent first)
  return Array.from(configMap.values()).sort((a, b) => b.savedAt - a.savedAt);
}

export async function syncConfigsToSupabase(userId: string): Promise<void> {
  try {
    const localConfigs = getSavedConfigs();

    for (const config of localConfigs) {
      await saveConfigToSupabase(userId, config);
    }
  } catch (err) {
    console.error('Error syncing configs to Supabase:', err);
  }
}
