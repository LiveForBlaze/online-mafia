// User-facing text for the auth feature, kept centralized so it is easy to translate later.
// When i18n is introduced, the values here become message catalogues; the keys stay the same.

export const AUTH_MESSAGES = {
  login: {
    title: 'Вход',
    submit: 'Войти',
    submitting: 'Вход...',
    emailLabel: 'Email',
    passwordLabel: 'Пароль',
    noAccountPrompt: 'Нет аккаунта?',
    registerLink: 'Зарегистрироваться',
    or: 'или',
  },
  register: {
    title: 'Регистрация',
    submit: 'Создать аккаунт',
    submitting: 'Создаём...',
    emailLabel: 'Email',
    passwordLabel: 'Пароль',
    passwordHint: 'Минимум 8 символов',
    nicknameLabel: 'Никнейм',
    nicknameHint: 'От 2 до 24 символов, как вас будут видеть другие игроки',
    haveAccountPrompt: 'Уже есть аккаунт?',
    loginLink: 'Войти',
  },
  google: {
    button: 'Войти через Google',
  },
  profile: {
    title: 'Профиль',
    nicknameLabel: 'Никнейм',
    nicknameHint: 'От 2 до 24 символов. Так вас увидят другие игроки.',
    emailLabel: 'Email',
    save: 'Сохранить',
    saving: 'Сохраняем...',
    saved: 'Сохранено',
    back: 'Назад',
  },
  errors: {
    invalid_credentials: 'Неверный email или пароль',
    email_taken: 'Этот email уже зарегистрирован',
    nickname_taken: 'Этот никнейм уже занят',
    password_not_set: 'Этот аккаунт привязан к Google. Войдите через Google.',
    google_oauth_not_configured: 'Вход через Google временно недоступен',
    google_email_not_verified: 'Email в вашем Google-аккаунте не подтверждён',
    invalid_input: 'Проверьте поля формы: email должен быть валидным, пароль — не короче 8 символов, никнейм — от 2 до 24 символов',
    unauthenticated: 'Сессия истекла. Войдите снова.',
    network: 'Ошибка соединения. Попробуйте ещё раз.',
    unknown: 'Что-то пошло не так',
  },
} as const;

export type AuthErrorMessageKey = keyof typeof AUTH_MESSAGES.errors;

/** Resolve an error code from the backend to a user-friendly message. */
export function authErrorMessage(code: string | undefined): string {
  if (code && code in AUTH_MESSAGES.errors) {
    return AUTH_MESSAGES.errors[code as AuthErrorMessageKey];
  }
  return AUTH_MESSAGES.errors.unknown;
}
