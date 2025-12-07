export type AnswerType = "single" | "multiple";

export interface Answer {
  text: string;
  correct: boolean;
}

export interface Question {
  question: string;
  answers: Answer[];
  answerType: AnswerType;
  timeLimit: number; // seconds
  readTime: number; // seconds to read question before showing answers
  mediaType?: "image" | "video";
  mediaUrl?: string; // Imgur or YouTube URL
  backgroundUrl?: string;
}

export interface GameSettings {
  pointsPerCorrectAnswer: number;
  timeBonus: boolean; // bonus points for faster answers
  showLeaderboardAfterEachQuestion: boolean;
  showCountdown?: boolean; // show countdown timer during reading and answering
  autoProceedWhenAllAnswered?: boolean; // automatically proceed to scoreboard when all players have answered
}

export interface GameConfig {
  name: string;
  description?: string;
  settings: GameSettings;
  questions: Question[];
}

export interface Player {
  id: string;
  name: string;
  score: number;
  answers: Record<number, number[]>; // questionIndex -> answerIndices
  answerTimes?: Record<number, number>; // questionIndex -> submission timestamp
  connected?: boolean; // track connection status
}

export interface GameState {
  gameId: string;
  config: GameConfig;
  currentQuestionIndex: number;
  phase:
    | "lobby"
    | "question-reading"
    | "question-answering"
    | "answer-review"
    | "distribution"
    | "scoreboard"
    | "leaderboard"
    | "finished";
  players: Record<string, Player>;
  questionStartTime?: number;
  answerStartTime?: number;
  choicesShown?: boolean;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
}
