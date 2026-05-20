// UI strings for the game feature. Keys mirror the constants in @mafia/shared
// so we can switch by phase/role/team without string literals in components.

import { GAME_PHASE, ROLE, TEAM } from '@mafia/shared';

export const GAME_MESSAGES = {
  phase: {
    [GAME_PHASE.LOBBY]: 'Лобби',
    [GAME_PHASE.ROLE_DISTRIBUTION]: 'Раздача ролей',
    [GAME_PHASE.NIGHT_ZERO]: 'Нулевая ночь — знакомство мафии',
    [GAME_PHASE.DAY_SPEECH]: 'День — речи',
    [GAME_PHASE.DAY_VOTE]: 'Голосование',
    [GAME_PHASE.DAY_REVOTE]: 'Переголосование',
    [GAME_PHASE.DAY_SHOOTOUT]: 'Перестрелка',
    [GAME_PHASE.DAY_LAST_WORD]: 'Последнее слово',
    [GAME_PHASE.NIGHT_MAFIA]: 'Ночь — выстрел мафии',
    [GAME_PHASE.NIGHT_DON]: 'Ночь — проверка дона',
    [GAME_PHASE.NIGHT_SHERIFF]: 'Ночь — проверка шерифа',
    [GAME_PHASE.MORNING_ANNOUNCEMENT]: 'Утро — итоги ночи',
    [GAME_PHASE.GAME_OVER]: 'Игра окончена',
  },
  role: {
    [ROLE.CIVILIAN]: 'Мирный',
    [ROLE.SHERIFF]: 'Шериф',
    [ROLE.MAFIA]: 'Мафия',
    [ROLE.DON]: 'Дон',
  },
  team: {
    [TEAM.RED]: 'Мирные',
    [TEAM.BLACK]: 'Мафия',
  },
  ui: {
    day: (n: number) => `День ${n}`,
    currentSpeaker: (seat: number) => `Говорит игрок №${seat}`,
    yourRole: 'Ваша роль',
    yourTeammates: 'Ваша команда',
    nominateButton: 'Выставить',
    cancelNomination: 'Отменить',
    nominations: 'Кандидаты',
    voteFor: (seat: number) => `За №${seat}`,
    voted: 'Вы проголосовали',
    waitingForVotes: 'Ожидание голосов',
    chooseMafiaTarget: 'Выберите цель для выстрела',
    chooseDonTarget: 'Кого проверить (вы дон)?',
    chooseSheriffTarget: 'Кого проверить (вы шериф)?',
    checkPositive: 'Да — это ваша цель',
    checkNegative: 'Нет — другой роли',
    sheriffCheckBlack: 'ЧЁРНЫЙ',
    sheriffCheckRed: 'КРАСНЫЙ',
    donCheckSheriff: 'ШЕРИФ',
    donCheckNotSheriff: 'НЕ ШЕРИФ',
    waitingForOthers: 'Ждём действий других игроков',
    mafiaTarget: (seat: number) => `Цель ночи: №${seat}`,
    morningVictim: (seat: number) => `Этой ночью убит игрок №${seat}`,
    nobodyDied: 'Этой ночью никто не погиб',
    winner: (teamName: string) => `Победили ${teamName.toLowerCase()}`,
    youDied: 'Вы выбыли из игры',
    youAreRemoved: 'Вы удалены судьёй',
    judge: 'Судья',
    judgePanel: 'Управление',
    advancePhase: 'Перейти к следующей фазе',
    nextSpeaker: 'Следующая речь',
    issueFoul: 'Фол',
    removePlayer: 'Удалить',
    back: '← Назад',
    leaveGame: 'Выйти из игры',
    sayOutOfTurn: 'Сказать под фол',
    sayOutOfTurnHint: 'Получите фол, аудио откроется на 5 секунд',
    outOfTurnOpen: 'Микрофон открыт',
    leaveGameConfirmTitle: 'Выйти из игры?',
    leaveGameConfirmMessage:
      'Вы будете удалены из игры навсегда. Просто закрыть вкладку безопасно — вы вернётесь в игру при следующем заходе. Жмите «Выйти» только если хотите выйти полностью.',
    leaveGameConfirm: 'Выйти',
  },
  errors: {
    not_participant: 'Вас нет в этой игре',
    game_not_found: 'Игра не найдена',
    wrong_phase: 'Действие недоступно сейчас',
    not_your_turn: 'Сейчас не ваш ход',
    not_authorized_role: 'Только определённая роль может это сделать',
    target_not_found: 'Цель не найдена',
    target_not_live: 'Этот игрок выбыл',
    already_voted: 'Вы уже проголосовали',
    already_nominated: 'Этот игрок уже выставлен',
    cannot_target_self: 'Нельзя голосовать против себя',
    unknown: 'Что-то пошло не так',
  },
} as const;

export function gameErrorMessage(code: string | undefined): string {
  if (code && code in GAME_MESSAGES.errors) {
    return GAME_MESSAGES.errors[code as keyof typeof GAME_MESSAGES.errors];
  }
  return GAME_MESSAGES.errors.unknown;
}
