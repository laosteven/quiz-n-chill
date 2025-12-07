/**
 * Player Management Service
 * Handles all player-related business logic including reconnection with score restoration
 */

import type { Player } from "$lib/types";

export class PlayerService {
  private players: Map<string, Player>;
  private playerScores: Map<string, number>;

  constructor() {
    this.players = new Map();
    this.playerScores = new Map();
  }

  /**
   * Add a new player or reconnect existing player
   */
  addPlayer(id: string, name: string, score?: number): Player {
    const cleanName = name.trim();
    const key = cleanName.toLowerCase();
    const restoredScore = score ?? this.playerScores.get(key) ?? 0;

    const player: Player = {
      id,
      name: cleanName,
      score: restoredScore,
      answers: {},
      connected: true,
    };

    this.players.set(id, player);
    this.playerScores.set(key, restoredScore);

    return player;
  }

  /**
   * Check if a username is taken by a connected player
   */
  isUsernameTaken(username: string, excludeId?: string): boolean {
    const key = username.toLowerCase();
    return Array.from(this.players.values()).some(
      (p) => p.name.toLowerCase() === key && p.connected && p.id !== excludeId
    );
  }

  /**
   * Find disconnected player by username
   */
  findDisconnectedPlayer(username: string): Player | undefined {
    const key = username.toLowerCase();
    const entry = Array.from(this.players.entries()).find(
      ([, p]) => p.name.toLowerCase() === key && !p.connected
    );
    return entry ? entry[1] : undefined;
  }

  /**
   * Get player by ID
   */
  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  /**
   * Get all players as array
   */
  getAllPlayers(): Player[] {
    return Array.from(this.players.values());
  }

  /**
   * Remove player by ID
   */
  removePlayer(id: string): boolean {
    return this.players.delete(id);
  }

  /**
   * Remove all disconnected players
   */
  clearDisconnected(): number {
    const before = this.players.size;
    for (const [id, player] of this.players.entries()) {
      if (!player.connected) {
        this.players.delete(id);
      }
    }
    return before - this.players.size;
  }

  /**
   * Update player name
   */
  updatePlayerName(id: string, newName: string): boolean {
    const player = this.players.get(id);
    if (!player) return false;

    const oldKey = player.name.toLowerCase();
    const newKey = newName.toLowerCase();
    const currentScore = player.score;

    player.name = newName;

    if (oldKey !== newKey) {
      this.playerScores.set(newKey, currentScore);
      this.playerScores.set(oldKey, currentScore);
    }

    return true;
  }

  /**
   * Mark player as disconnected
   */
  markDisconnected(id: string): boolean {
    const player = this.players.get(id);
    if (!player) return false;

    player.connected = false;
    this.playerScores.set(player.name.toLowerCase(), player.score);

    return true;
  }

  /**
   * Get stored score for a username
   */
  getStoredScore(username: string): number {
    return this.playerScores.get(username.toLowerCase()) ?? 0;
  }

  /**
   * Clear all players
   */
  clearAllPlayers(): void {
    this.players.clear();
    this.playerScores.clear();
  }
}
