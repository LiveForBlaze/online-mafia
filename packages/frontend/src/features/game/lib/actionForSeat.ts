// Решает, какая кнопка действия отрисовывается на seat-тайле для данного
// viewer'а в текущей фазе.
//
// Один switch на всех — это единое место правды по правилам «кто на что
// может нажать». Любая phase-specific логика отрисовки seat-actions живёт
// здесь, а не размазана по тайлам и судейским панелям.

import { type TFunction } from 'i18next';

import { CLIENT_EVENT, GAME_PHASE, ROLE, type GameStateProjected, type Role } from '@mafia/shared';

import { emitGameAction } from '@/features/game/socket/game.socket.js';

export interface SeatAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ActionForSeatArgs {
  t: TFunction;
  state: GameStateProjected;
  viewerRole: Role | null;
  viewerSeat: number | null;
  viewerUserId: string;
  viewerIsAlive: boolean;
  viewerIsJudge: boolean;
  participantSeat: number;
  participantIsAlive: boolean;
  participantUserId: string;
}

export function actionForSeatInCurrentPhase(args: ActionForSeatArgs): SeatAction | null {
  const {
    t,
    state,
    viewerRole,
    viewerUserId,
    viewerIsAlive,
    viewerIsJudge,
    participantSeat,
    participantIsAlive,
    participantUserId,
  } = args;

  // Судья — не «живой игрок», но всё равно может выставлять. Поэтому пропуск
  // alive-проверки для него. На своего собственного тайла кнопок нет — у
  // судьи такого тайла и нет в принципе.
  if (!viewerIsJudge) {
    if (!viewerIsAlive || !participantIsAlive) return null;
    if (participantUserId === viewerUserId) return null;
  } else if (!participantIsAlive) {
    return null;
  }

  switch (state.phase) {
    case GAME_PHASE.DAY_SPEECH:
      // Выставление управляет судья: игрок говорит «выставляю №X» голосом,
      // судья кликает по тайлу. Игроки кнопок не видят. Одна номинация на
      // речь: после клика nominationLockedForSpeaker блокирует все кнопки
      // до следующего спикера. Self-nomination разрешено.
      if (!viewerIsJudge) return null;
      if (state.currentSpeakerSeat === null) return null;
      if (state.farewellSeat !== null) return null;
      if (state.nominationLockedForSpeaker) return null;
      if (state.nominationSeats.includes(participantSeat)) return null;
      return {
        label: t('game.ui.nominateButton'),
        onClick: () =>
          emitGameAction(CLIENT_EVENT.NOMINATE_PLAYER, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.DAY_VOTE:
    case GAME_PHASE.DAY_REVOTE:
      // Кнопка «ЗА» живёт в InfoTile (и MobileStage), не на тайле — чтобы
      // игроки не искали её среди десяти мест.
      return null;

    case GAME_PHASE.NIGHT_MAFIA:
      if (viewerRole !== ROLE.MAFIA && viewerRole !== ROLE.DON) return null;
      // Скрываем кнопку как только viewer проголосовал. Другие шутёры
      // продолжают видеть свою кнопку — пока не выскажутся сами.
      if (state.myMafiaVote !== null) return null;
      return {
        label: t('game.ui.shootButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.MAFIA_TARGET, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_DON:
      if (viewerRole !== ROLE.DON) return null;
      if (state.myCheckResult !== null) return null;
      return {
        label: t('game.ui.checkButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.DON_CHECK, { targetSeat: participantSeat }),
      };

    case GAME_PHASE.NIGHT_SHERIFF:
      if (viewerRole !== ROLE.SHERIFF) return null;
      if (state.myCheckResult !== null) return null;
      return {
        label: t('game.ui.checkButton'),
        onClick: () => emitGameAction(CLIENT_EVENT.SHERIFF_CHECK, { targetSeat: participantSeat }),
      };

    default:
      return null;
  }
}
