// Branded ID types prevent accidentally passing a user ID where a game ID is expected.
// At runtime they are plain strings; at compile time TypeScript treats them as distinct.

type Brand<TBase, TBrand extends string> = TBase & { readonly __brand: TBrand };

export type UserId = Brand<string, 'UserId'>;
export type GameId = Brand<string, 'GameId'>;
export type LobbyId = Brand<string, 'LobbyId'>;
export type SeatNumber = Brand<number, 'SeatNumber'>;
