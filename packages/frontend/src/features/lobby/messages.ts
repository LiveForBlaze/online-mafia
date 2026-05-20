// User-facing strings for the lobby feature. Centralized to ease later i18n.

// Russian plural form selector. `forms` is [one, few, many]. Local to this file
// so callers can just write `LOBBY_MESSAGES.list.statsOpen(n)` without thinking
// about plural rules.
function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

export const LOBBY_MESSAGES = {
  list: {
    title: 'Лобби',
    empty: 'Сейчас нет открытых лобби. Создайте своё.',
    createButton: 'Создать лобби',
    refresh: 'Обновить',
    betaNotice:
      'Это тестовая версия приложения. Возможны баги и поломки — финального продукта это пока не отражает.',
    activeGamesTitle: 'Активные игры',
    openGamesTitle: 'Открытые лобби',
    resumeGameTitle: 'У вас есть незавершённая игра',
    resumeGameDescription:
      'Вы выпали из неё (закрытая вкладка, потеря связи). Решите — вернуться или выйти насовсем.',
    resumeGameButton: 'Вернуться к игре',
    resumeGameLeaveButton: 'Покинуть игру',
    resumeGameLeaving: 'Выходим...',
    // Hero / branding
    brandWordmark: 'online-mafia',
    tagline: 'Спортивная мафия онлайн',
    // Stats row
    statsOpen: (n: number) =>
      `${n} ${pluralRu(n, ['открытое лобби', 'открытых лобби', 'открытых лобби'])}`,
    statsWaiting: (n: number) =>
      `${n} ${pluralRu(n, ['игрок ждёт партии', 'игрока ждут партии', 'игроков ждут партии'])}`,
    statsPrivate: (n: number) => `${n} ${pluralRu(n, ['приватное', 'приватных', 'приватных'])}`,
    // Empty state
    emptyTitle: 'Здесь пока тихо',
    emptyDescription: 'Сейчас нет открытых лобби. Создайте своё — и сядьте за стол первым.',
    emptyCta: 'Создать лобби',
    // Footer
    footer: 'online-mafia · бета-версия · MIT',
  },
  card: {
    private: 'Приватное',
    public: 'Открытое',
    membersOf: (current: number, max: number) => `${current} из ${max} игроков`,
    membersShort: (current: number, max: number) => `${current}/${max}`,
    join: 'Войти',
    continue: 'Продолжить',
    host: 'Хост',
    hostPrefix: 'Хост: ',
  },
  create: {
    title: 'Создать лобби',
    name: 'Название',
    namePlaceholder: 'Например, «Пятничная мафия»',
    isPrivate: 'Приватное лобби (по паролю)',
    password: 'Пароль',
    passwordHint: 'От 4 до 64 символов',
    role: 'Ваша роль',
    rolePlayer: 'Игрок',
    roleJudge: 'Судья',
    judgeNotice:
      'Вы будете судьёй (ведущим). Передать роль другому нельзя — если вы выйдете, лобби закроется.',
    submit: 'Создать',
    submitting: 'Создаём...',
    cancel: 'Отмена',
  },
  joinPrivate: {
    title: 'Введите пароль',
    password: 'Пароль',
    submit: 'Войти',
    submitting: 'Входим...',
    cancel: 'Отмена',
  },
  room: {
    back: '← Назад к списку',
    leave: 'Покинуть лобби',
    leaving: 'Выходим...',
    close: 'Закрыть лобби',
    kick: 'Удалить',
    kickTitle: 'Удалить игрока',
    judge: 'Судья',
    judgeUpper: 'СУДЬЯ',
    judgeSlotEmpty: 'Место судьи свободно',
    judgeNonTransferable: 'Не передаётся',
    judgePresent: (nickname: string) => `Судья: ✓ ${nickname}`,
    judgeAbsent: 'Судья: ✗ свободно',
    seatEmpty: 'Свободно',
    seatLabel: (n: number) => `Место ${n}`,
    hostBadge: 'Хост',
    waitingFor: (n: number) => `Ожидаем игроков (${n} нужно)`,
    needJudge: 'Нужен судья — ботом он стать не может, кто-то должен занять место судьи',
    ready: 'Все на местах — можно начинать',
    startGame: 'Начать игру',
    startGameDisabled: 'Игровой движок появится в следующем модуле',
    fillBots: 'Заполнить ботами',
    fillingBots: 'Добавляем ботов...',
    becomeJudge: 'Стать судьёй',
    becomingJudge: 'Меняем место...',
    you: 'вы',
    share: 'Поделиться',
    shareCopied: 'Скопировано',
    createdAgo: (rel: string) => `Создано ${rel}`,
    seatsProgress: (current: number, total: number) => `Места: ${current} / ${total}`,
    membersChip: (current: number, max: number) => `${current} / ${max} игроков`,
  },
  errors: {
    lobby_not_found: 'Лобби не найдено',
    lobby_not_open: 'Лобби закрыто или уже играет',
    lobby_full: 'Лобби заполнено',
    judge_slot_taken: 'Место судьи уже занято',
    already_member: 'Вы уже в этом лобби',
    not_member: 'Вы не состоите в этом лобби',
    not_host: 'Только хост может это сделать',
    password_required: 'Требуется пароль',
    wrong_password: 'Неверный пароль',
    target_not_found: 'Игрок не найден в лобби',
    cannot_kick_host: 'Нельзя выгнать хоста',
    seat_contention: 'Место заняли. Попробуйте ещё раз.',
    role_cap_reached: 'Слотов для этой роли больше нет (макс. 1 шериф / 1 дон / 2 мафии).',
    invalid_input: 'Проверьте правильность введённых данных',
    unauthenticated: 'Войдите снова',
    unknown: 'Что-то пошло не так',
  },
} as const;

type LobbyErrorKey = keyof typeof LOBBY_MESSAGES.errors;

export function lobbyErrorMessage(code: string | undefined): string {
  if (code && code in LOBBY_MESSAGES.errors) {
    return LOBBY_MESSAGES.errors[code as LobbyErrorKey];
  }
  return LOBBY_MESSAGES.errors.unknown;
}
