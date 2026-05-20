// User-facing strings for the lobby feature. Centralized to ease later i18n.

export const LOBBY_MESSAGES = {
  list: {
    title: 'Лобби',
    empty: 'Сейчас нет открытых лобби. Создайте своё.',
    createButton: 'Создать лобби',
    refresh: 'Обновить',
  },
  card: {
    private: 'Приватное',
    public: 'Открытое',
    membersOf: (current: number, max: number) => `${current} из ${max} игроков`,
    join: 'Войти',
    continue: 'Продолжить',
    host: 'Хост',
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
    judge: 'Судья',
    judgeSlotEmpty: 'Место судьи свободно',
    seatEmpty: 'Свободно',
    seatLabel: (n: number) => `Место ${n}`,
    hostBadge: 'Хост',
    waitingFor: (n: number) => `Ожидаем игроков (${n} нужно)`,
    ready: 'Все на местах — можно начинать',
    startGame: 'Начать игру',
    startGameDisabled: 'Игровой движок появится в следующем модуле',
    fillBots: 'Заполнить ботами',
    fillingBots: 'Добавляем ботов...',
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
