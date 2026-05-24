// Space-хоткей для судейского «Дальше».
//
// Реальный мафиозный судья за столом говорит «следующий» и хлопает в ладоши.
// Онлайн — пробел. Мы делаем то же, что и для голосующих игроков
// (useVoteHotkey), только для судьи: ОДИН клавиатурный жест двигает партию
// на один шаг вперёд (next speaker / next round / next phase).
//
// Игроки своим пробелом голосуют. Хоткей судьи не конфликтует, потому что
// активируется только когда `viewerIsJudge` — это две взаимоисключающие роли.

import { useEffect } from 'react';

import { CLIENT_EVENT, GAME_PHASE, type GamePhase, type GameStateProjected } from '@mafia/shared';

import { emitGameAction } from '@/features/game/socket/game.socket.js';

// Совпадает со списком в JudgePanel — фазы, где «Дальше» = next speaker,
// а не next phase. Когда внутренние шаги закончатся, сервер сам перейдёт
// в следующую фазу.
const STEPS_WITHIN_PHASE: ReadonlyArray<GamePhase> = [
  GAME_PHASE.DAY_SPEECH,
  GAME_PHASE.DAY_VOTE,
  GAME_PHASE.DAY_REVOTE,
  GAME_PHASE.DAY_SHOOTOUT,
  GAME_PHASE.DAY_LAST_WORD,
];

export function judgeStep(state: GameStateProjected): void {
  if (state.status === 'finished') return;
  if (STEPS_WITHIN_PHASE.includes(state.phase)) {
    void emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_SPEAKER);
  } else {
    void emitGameAction(CLIENT_EVENT.JUDGE_ADVANCE_PHASE);
  }
}

export function useJudgeStepHotkey(state: GameStateProjected | null, viewerIsJudge: boolean): void {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code !== 'Space') return;
      if (!state || !viewerIsJudge) return;
      // Не съедаем пробел в текстовых полях.
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }
      if (event.repeat) return;
      event.preventDefault();
      judgeStep(state);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, viewerIsJudge]);
}
