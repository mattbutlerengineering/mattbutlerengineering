
/**
 * Client
**/

import * as runtime from './runtime/client.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model VenueGroup
 * 
 */
export type VenueGroup = $Result.DefaultSelection<Prisma.$VenueGroupPayload>
/**
 * Model Venue
 * 
 */
export type Venue = $Result.DefaultSelection<Prisma.$VenuePayload>
/**
 * Model FloorPlan
 * 
 */
export type FloorPlan = $Result.DefaultSelection<Prisma.$FloorPlanPayload>
/**
 * Model Table
 * 
 */
export type Table = $Result.DefaultSelection<Prisma.$TablePayload>
/**
 * Model Guest
 * 
 */
export type Guest = $Result.DefaultSelection<Prisma.$GuestPayload>
/**
 * Model Reservation
 * 
 */
export type Reservation = $Result.DefaultSelection<Prisma.$ReservationPayload>
/**
 * Model Deposit
 * 
 */
export type Deposit = $Result.DefaultSelection<Prisma.$DepositPayload>
/**
 * Model WaitlistEntry
 * 
 */
export type WaitlistEntry = $Result.DefaultSelection<Prisma.$WaitlistEntryPayload>
/**
 * Model ReservationHold
 * 
 */
export type ReservationHold = $Result.DefaultSelection<Prisma.$ReservationHoldPayload>

/**
 * Enums
 */
export namespace $Enums {
  export const ReservationStatus: {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  NO_SHOW: 'NO_SHOW'
};

export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus]


export const Occasion: {
  birthday: 'birthday',
  anniversary: 'anniversary',
  business: 'business',
  date_night: 'date_night',
  other: 'other',
  none: 'none'
};

export type Occasion = (typeof Occasion)[keyof typeof Occasion]


export const SeatingPreference: {
  booth: 'booth',
  patio: 'patio',
  bar: 'bar',
  window: 'window',
  quiet: 'quiet',
  no_preference: 'no_preference'
};

export type SeatingPreference = (typeof SeatingPreference)[keyof typeof SeatingPreference]


export const CommunicationPreference: {
  email_only: 'email_only',
  sms_only: 'sms_only',
  both: 'both',
  transactional_only: 'transactional_only'
};

export type CommunicationPreference = (typeof CommunicationPreference)[keyof typeof CommunicationPreference]


export const TableStatus: {
  AVAILABLE: 'AVAILABLE',
  OCCUPIED: 'OCCUPIED',
  DIRTY: 'DIRTY',
  READY: 'READY'
};

export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus]


export const DepositStatus: {
  pending: 'pending',
  held: 'held',
  applied: 'applied',
  refunded: 'refunded',
  forfeited: 'forfeited'
};

export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus]


export const DepositType: {
  flat: 'flat',
  per_person: 'per_person'
};

export type DepositType = (typeof DepositType)[keyof typeof DepositType]


export const WaitlistStatus: {
  waiting: 'waiting',
  notified: 'notified',
  seated: 'seated',
  expired: 'expired',
  cancelled: 'cancelled'
};

export type WaitlistStatus = (typeof WaitlistStatus)[keyof typeof WaitlistStatus]

}

export type ReservationStatus = $Enums.ReservationStatus

export const ReservationStatus: typeof $Enums.ReservationStatus

export type Occasion = $Enums.Occasion

export const Occasion: typeof $Enums.Occasion

export type SeatingPreference = $Enums.SeatingPreference

export const SeatingPreference: typeof $Enums.SeatingPreference

export type CommunicationPreference = $Enums.CommunicationPreference

export const CommunicationPreference: typeof $Enums.CommunicationPreference

export type TableStatus = $Enums.TableStatus

export const TableStatus: typeof $Enums.TableStatus

export type DepositStatus = $Enums.DepositStatus

export const DepositStatus: typeof $Enums.DepositStatus

export type DepositType = $Enums.DepositType

export const DepositType: typeof $Enums.DepositType

export type WaitlistStatus = $Enums.WaitlistStatus

export const WaitlistStatus: typeof $Enums.WaitlistStatus

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more VenueGroups
 * const venueGroups = await prisma.venueGroup.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient({
   *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
   * })
   * // Fetch zero or more VenueGroups
   * const venueGroups = await prisma.venueGroup.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): PrismaClient;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   *
   * Read more in our [docs](https://pris.ly/d/raw-queries).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/orm/prisma-client/queries/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>

  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb<ClientOptions>, ExtArgs, $Utils.Call<Prisma.TypeMapCb<ClientOptions>, {
    extArgs: ExtArgs
  }>>

      /**
   * `prisma.venueGroup`: Exposes CRUD operations for the **VenueGroup** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more VenueGroups
    * const venueGroups = await prisma.venueGroup.findMany()
    * ```
    */
  get venueGroup(): Prisma.VenueGroupDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.venue`: Exposes CRUD operations for the **Venue** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Venues
    * const venues = await prisma.venue.findMany()
    * ```
    */
  get venue(): Prisma.VenueDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.floorPlan`: Exposes CRUD operations for the **FloorPlan** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more FloorPlans
    * const floorPlans = await prisma.floorPlan.findMany()
    * ```
    */
  get floorPlan(): Prisma.FloorPlanDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.table`: Exposes CRUD operations for the **Table** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Tables
    * const tables = await prisma.table.findMany()
    * ```
    */
  get table(): Prisma.TableDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.guest`: Exposes CRUD operations for the **Guest** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Guests
    * const guests = await prisma.guest.findMany()
    * ```
    */
  get guest(): Prisma.GuestDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.reservation`: Exposes CRUD operations for the **Reservation** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Reservations
    * const reservations = await prisma.reservation.findMany()
    * ```
    */
  get reservation(): Prisma.ReservationDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.deposit`: Exposes CRUD operations for the **Deposit** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more Deposits
    * const deposits = await prisma.deposit.findMany()
    * ```
    */
  get deposit(): Prisma.DepositDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.waitlistEntry`: Exposes CRUD operations for the **WaitlistEntry** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WaitlistEntries
    * const waitlistEntries = await prisma.waitlistEntry.findMany()
    * ```
    */
  get waitlistEntry(): Prisma.WaitlistEntryDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.reservationHold`: Exposes CRUD operations for the **ReservationHold** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more ReservationHolds
    * const reservationHolds = await prisma.reservationHold.findMany()
    * ```
    */
  get reservationHold(): Prisma.ReservationHoldDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 7.8.0
   * Query Engine version: 3c6e192761c0362d496ed980de936e2f3cebcd3a
   */
  export type PrismaVersion = {
    client: string
    engine: string
  }

  export const prismaVersion: PrismaVersion

  /**
   * Utility Types
   */


  export import Bytes = runtime.Bytes
  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    *
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    *
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? P : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    VenueGroup: 'VenueGroup',
    Venue: 'Venue',
    FloorPlan: 'FloorPlan',
    Table: 'Table',
    Guest: 'Guest',
    Reservation: 'Reservation',
    Deposit: 'Deposit',
    WaitlistEntry: 'WaitlistEntry',
    ReservationHold: 'ReservationHold'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]



  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<{extArgs: $Extensions.InternalArgs }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> = {
    globalOmitOptions: {
      omit: GlobalOmitOptions
    }
    meta: {
      modelProps: "venueGroup" | "venue" | "floorPlan" | "table" | "guest" | "reservation" | "deposit" | "waitlistEntry" | "reservationHold"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      VenueGroup: {
        payload: Prisma.$VenueGroupPayload<ExtArgs>
        fields: Prisma.VenueGroupFieldRefs
        operations: {
          findUnique: {
            args: Prisma.VenueGroupFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.VenueGroupFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>
          }
          findFirst: {
            args: Prisma.VenueGroupFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.VenueGroupFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>
          }
          findMany: {
            args: Prisma.VenueGroupFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>[]
          }
          create: {
            args: Prisma.VenueGroupCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>
          }
          createMany: {
            args: Prisma.VenueGroupCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.VenueGroupCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>[]
          }
          delete: {
            args: Prisma.VenueGroupDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>
          }
          update: {
            args: Prisma.VenueGroupUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>
          }
          deleteMany: {
            args: Prisma.VenueGroupDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.VenueGroupUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.VenueGroupUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>[]
          }
          upsert: {
            args: Prisma.VenueGroupUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenueGroupPayload>
          }
          aggregate: {
            args: Prisma.VenueGroupAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateVenueGroup>
          }
          groupBy: {
            args: Prisma.VenueGroupGroupByArgs<ExtArgs>
            result: $Utils.Optional<VenueGroupGroupByOutputType>[]
          }
          count: {
            args: Prisma.VenueGroupCountArgs<ExtArgs>
            result: $Utils.Optional<VenueGroupCountAggregateOutputType> | number
          }
        }
      }
      Venue: {
        payload: Prisma.$VenuePayload<ExtArgs>
        fields: Prisma.VenueFieldRefs
        operations: {
          findUnique: {
            args: Prisma.VenueFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.VenueFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>
          }
          findFirst: {
            args: Prisma.VenueFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.VenueFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>
          }
          findMany: {
            args: Prisma.VenueFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>[]
          }
          create: {
            args: Prisma.VenueCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>
          }
          createMany: {
            args: Prisma.VenueCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.VenueCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>[]
          }
          delete: {
            args: Prisma.VenueDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>
          }
          update: {
            args: Prisma.VenueUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>
          }
          deleteMany: {
            args: Prisma.VenueDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.VenueUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.VenueUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>[]
          }
          upsert: {
            args: Prisma.VenueUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$VenuePayload>
          }
          aggregate: {
            args: Prisma.VenueAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateVenue>
          }
          groupBy: {
            args: Prisma.VenueGroupByArgs<ExtArgs>
            result: $Utils.Optional<VenueGroupByOutputType>[]
          }
          count: {
            args: Prisma.VenueCountArgs<ExtArgs>
            result: $Utils.Optional<VenueCountAggregateOutputType> | number
          }
        }
      }
      FloorPlan: {
        payload: Prisma.$FloorPlanPayload<ExtArgs>
        fields: Prisma.FloorPlanFieldRefs
        operations: {
          findUnique: {
            args: Prisma.FloorPlanFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.FloorPlanFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>
          }
          findFirst: {
            args: Prisma.FloorPlanFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.FloorPlanFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>
          }
          findMany: {
            args: Prisma.FloorPlanFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>[]
          }
          create: {
            args: Prisma.FloorPlanCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>
          }
          createMany: {
            args: Prisma.FloorPlanCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.FloorPlanCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>[]
          }
          delete: {
            args: Prisma.FloorPlanDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>
          }
          update: {
            args: Prisma.FloorPlanUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>
          }
          deleteMany: {
            args: Prisma.FloorPlanDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.FloorPlanUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.FloorPlanUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>[]
          }
          upsert: {
            args: Prisma.FloorPlanUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$FloorPlanPayload>
          }
          aggregate: {
            args: Prisma.FloorPlanAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateFloorPlan>
          }
          groupBy: {
            args: Prisma.FloorPlanGroupByArgs<ExtArgs>
            result: $Utils.Optional<FloorPlanGroupByOutputType>[]
          }
          count: {
            args: Prisma.FloorPlanCountArgs<ExtArgs>
            result: $Utils.Optional<FloorPlanCountAggregateOutputType> | number
          }
        }
      }
      Table: {
        payload: Prisma.$TablePayload<ExtArgs>
        fields: Prisma.TableFieldRefs
        operations: {
          findUnique: {
            args: Prisma.TableFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.TableFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>
          }
          findFirst: {
            args: Prisma.TableFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.TableFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>
          }
          findMany: {
            args: Prisma.TableFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>[]
          }
          create: {
            args: Prisma.TableCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>
          }
          createMany: {
            args: Prisma.TableCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.TableCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>[]
          }
          delete: {
            args: Prisma.TableDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>
          }
          update: {
            args: Prisma.TableUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>
          }
          deleteMany: {
            args: Prisma.TableDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.TableUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.TableUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>[]
          }
          upsert: {
            args: Prisma.TableUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$TablePayload>
          }
          aggregate: {
            args: Prisma.TableAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateTable>
          }
          groupBy: {
            args: Prisma.TableGroupByArgs<ExtArgs>
            result: $Utils.Optional<TableGroupByOutputType>[]
          }
          count: {
            args: Prisma.TableCountArgs<ExtArgs>
            result: $Utils.Optional<TableCountAggregateOutputType> | number
          }
        }
      }
      Guest: {
        payload: Prisma.$GuestPayload<ExtArgs>
        fields: Prisma.GuestFieldRefs
        operations: {
          findUnique: {
            args: Prisma.GuestFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.GuestFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>
          }
          findFirst: {
            args: Prisma.GuestFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.GuestFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>
          }
          findMany: {
            args: Prisma.GuestFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>[]
          }
          create: {
            args: Prisma.GuestCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>
          }
          createMany: {
            args: Prisma.GuestCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.GuestCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>[]
          }
          delete: {
            args: Prisma.GuestDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>
          }
          update: {
            args: Prisma.GuestUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>
          }
          deleteMany: {
            args: Prisma.GuestDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.GuestUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.GuestUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>[]
          }
          upsert: {
            args: Prisma.GuestUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$GuestPayload>
          }
          aggregate: {
            args: Prisma.GuestAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateGuest>
          }
          groupBy: {
            args: Prisma.GuestGroupByArgs<ExtArgs>
            result: $Utils.Optional<GuestGroupByOutputType>[]
          }
          count: {
            args: Prisma.GuestCountArgs<ExtArgs>
            result: $Utils.Optional<GuestCountAggregateOutputType> | number
          }
        }
      }
      Reservation: {
        payload: Prisma.$ReservationPayload<ExtArgs>
        fields: Prisma.ReservationFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ReservationFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ReservationFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>
          }
          findFirst: {
            args: Prisma.ReservationFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ReservationFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>
          }
          findMany: {
            args: Prisma.ReservationFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>[]
          }
          create: {
            args: Prisma.ReservationCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>
          }
          createMany: {
            args: Prisma.ReservationCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ReservationCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>[]
          }
          delete: {
            args: Prisma.ReservationDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>
          }
          update: {
            args: Prisma.ReservationUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>
          }
          deleteMany: {
            args: Prisma.ReservationDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ReservationUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ReservationUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>[]
          }
          upsert: {
            args: Prisma.ReservationUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationPayload>
          }
          aggregate: {
            args: Prisma.ReservationAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateReservation>
          }
          groupBy: {
            args: Prisma.ReservationGroupByArgs<ExtArgs>
            result: $Utils.Optional<ReservationGroupByOutputType>[]
          }
          count: {
            args: Prisma.ReservationCountArgs<ExtArgs>
            result: $Utils.Optional<ReservationCountAggregateOutputType> | number
          }
        }
      }
      Deposit: {
        payload: Prisma.$DepositPayload<ExtArgs>
        fields: Prisma.DepositFieldRefs
        operations: {
          findUnique: {
            args: Prisma.DepositFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.DepositFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          findFirst: {
            args: Prisma.DepositFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.DepositFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          findMany: {
            args: Prisma.DepositFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>[]
          }
          create: {
            args: Prisma.DepositCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          createMany: {
            args: Prisma.DepositCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.DepositCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>[]
          }
          delete: {
            args: Prisma.DepositDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          update: {
            args: Prisma.DepositUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          deleteMany: {
            args: Prisma.DepositDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.DepositUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.DepositUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>[]
          }
          upsert: {
            args: Prisma.DepositUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$DepositPayload>
          }
          aggregate: {
            args: Prisma.DepositAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateDeposit>
          }
          groupBy: {
            args: Prisma.DepositGroupByArgs<ExtArgs>
            result: $Utils.Optional<DepositGroupByOutputType>[]
          }
          count: {
            args: Prisma.DepositCountArgs<ExtArgs>
            result: $Utils.Optional<DepositCountAggregateOutputType> | number
          }
        }
      }
      WaitlistEntry: {
        payload: Prisma.$WaitlistEntryPayload<ExtArgs>
        fields: Prisma.WaitlistEntryFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WaitlistEntryFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WaitlistEntryFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>
          }
          findFirst: {
            args: Prisma.WaitlistEntryFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WaitlistEntryFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>
          }
          findMany: {
            args: Prisma.WaitlistEntryFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>[]
          }
          create: {
            args: Prisma.WaitlistEntryCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>
          }
          createMany: {
            args: Prisma.WaitlistEntryCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WaitlistEntryCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>[]
          }
          delete: {
            args: Prisma.WaitlistEntryDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>
          }
          update: {
            args: Prisma.WaitlistEntryUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>
          }
          deleteMany: {
            args: Prisma.WaitlistEntryDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WaitlistEntryUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.WaitlistEntryUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>[]
          }
          upsert: {
            args: Prisma.WaitlistEntryUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WaitlistEntryPayload>
          }
          aggregate: {
            args: Prisma.WaitlistEntryAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWaitlistEntry>
          }
          groupBy: {
            args: Prisma.WaitlistEntryGroupByArgs<ExtArgs>
            result: $Utils.Optional<WaitlistEntryGroupByOutputType>[]
          }
          count: {
            args: Prisma.WaitlistEntryCountArgs<ExtArgs>
            result: $Utils.Optional<WaitlistEntryCountAggregateOutputType> | number
          }
        }
      }
      ReservationHold: {
        payload: Prisma.$ReservationHoldPayload<ExtArgs>
        fields: Prisma.ReservationHoldFieldRefs
        operations: {
          findUnique: {
            args: Prisma.ReservationHoldFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.ReservationHoldFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>
          }
          findFirst: {
            args: Prisma.ReservationHoldFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.ReservationHoldFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>
          }
          findMany: {
            args: Prisma.ReservationHoldFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>[]
          }
          create: {
            args: Prisma.ReservationHoldCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>
          }
          createMany: {
            args: Prisma.ReservationHoldCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.ReservationHoldCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>[]
          }
          delete: {
            args: Prisma.ReservationHoldDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>
          }
          update: {
            args: Prisma.ReservationHoldUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>
          }
          deleteMany: {
            args: Prisma.ReservationHoldDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.ReservationHoldUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateManyAndReturn: {
            args: Prisma.ReservationHoldUpdateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>[]
          }
          upsert: {
            args: Prisma.ReservationHoldUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$ReservationHoldPayload>
          }
          aggregate: {
            args: Prisma.ReservationHoldAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateReservationHold>
          }
          groupBy: {
            args: Prisma.ReservationHoldGroupByArgs<ExtArgs>
            result: $Utils.Optional<ReservationHoldGroupByOutputType>[]
          }
          count: {
            args: Prisma.ReservationHoldCountArgs<ExtArgs>
            result: $Utils.Optional<ReservationHoldCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Shorthand for `emit: 'stdout'`
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events only
     * log: [
     *   { emit: 'event', level: 'query' },
     *   { emit: 'event', level: 'info' },
     *   { emit: 'event', level: 'warn' }
     *   { emit: 'event', level: 'error' }
     * ]
     * 
     * / Emit as events and log to stdout
     * og: [
     *  { emit: 'stdout', level: 'query' },
     *  { emit: 'stdout', level: 'info' },
     *  { emit: 'stdout', level: 'warn' }
     *  { emit: 'stdout', level: 'error' }
     * 
     * ```
     * Read more in our [docs](https://pris.ly/d/logging).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string
    /**
     * Global configuration for omitting model fields by default.
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   omit: {
     *     user: {
     *       password: true
     *     }
     *   }
     * })
     * ```
     */
    omit?: Prisma.GlobalOmitConfig
    /**
     * SQL commenter plugins that add metadata to SQL queries as comments.
     * Comments follow the sqlcommenter format: https://google.github.io/sqlcommenter/
     * 
     * @example
     * ```
     * const prisma = new PrismaClient({
     *   adapter,
     *   comments: [
     *     traceContext(),
     *     queryInsights(),
     *   ],
     * })
     * ```
     */
    comments?: runtime.SqlCommenterPlugin[]
  }
  export type GlobalOmitConfig = {
    venueGroup?: VenueGroupOmit
    venue?: VenueOmit
    floorPlan?: FloorPlanOmit
    table?: TableOmit
    guest?: GuestOmit
    reservation?: ReservationOmit
    deposit?: DepositOmit
    waitlistEntry?: WaitlistEntryOmit
    reservationHold?: ReservationHoldOmit
  }

  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<
    T extends LogDefinition ? T['level'] : T
  >;

  export type GetEvents<T extends any[]> = T extends Array<LogLevel | LogDefinition>
    ? GetLogType<T[number]>
    : never;

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'updateManyAndReturn'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */


  /**
   * Count Type VenueGroupCountOutputType
   */

  export type VenueGroupCountOutputType = {
    venues: number
  }

  export type VenueGroupCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venues?: boolean | VenueGroupCountOutputTypeCountVenuesArgs
  }

  // Custom InputTypes
  /**
   * VenueGroupCountOutputType without action
   */
  export type VenueGroupCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroupCountOutputType
     */
    select?: VenueGroupCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * VenueGroupCountOutputType without action
   */
  export type VenueGroupCountOutputTypeCountVenuesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: VenueWhereInput
  }


  /**
   * Count Type VenueCountOutputType
   */

  export type VenueCountOutputType = {
    tables: number
    reservations: number
    guests: number
    floorPlans: number
    holds: number
  }

  export type VenueCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tables?: boolean | VenueCountOutputTypeCountTablesArgs
    reservations?: boolean | VenueCountOutputTypeCountReservationsArgs
    guests?: boolean | VenueCountOutputTypeCountGuestsArgs
    floorPlans?: boolean | VenueCountOutputTypeCountFloorPlansArgs
    holds?: boolean | VenueCountOutputTypeCountHoldsArgs
  }

  // Custom InputTypes
  /**
   * VenueCountOutputType without action
   */
  export type VenueCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueCountOutputType
     */
    select?: VenueCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * VenueCountOutputType without action
   */
  export type VenueCountOutputTypeCountTablesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TableWhereInput
  }

  /**
   * VenueCountOutputType without action
   */
  export type VenueCountOutputTypeCountReservationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationWhereInput
  }

  /**
   * VenueCountOutputType without action
   */
  export type VenueCountOutputTypeCountGuestsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GuestWhereInput
  }

  /**
   * VenueCountOutputType without action
   */
  export type VenueCountOutputTypeCountFloorPlansArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: FloorPlanWhereInput
  }

  /**
   * VenueCountOutputType without action
   */
  export type VenueCountOutputTypeCountHoldsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationHoldWhereInput
  }


  /**
   * Count Type FloorPlanCountOutputType
   */

  export type FloorPlanCountOutputType = {
    tables: number
  }

  export type FloorPlanCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    tables?: boolean | FloorPlanCountOutputTypeCountTablesArgs
  }

  // Custom InputTypes
  /**
   * FloorPlanCountOutputType without action
   */
  export type FloorPlanCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlanCountOutputType
     */
    select?: FloorPlanCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * FloorPlanCountOutputType without action
   */
  export type FloorPlanCountOutputTypeCountTablesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TableWhereInput
  }


  /**
   * Count Type TableCountOutputType
   */

  export type TableCountOutputType = {
    reservations: number
    holds: number
  }

  export type TableCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    reservations?: boolean | TableCountOutputTypeCountReservationsArgs
    holds?: boolean | TableCountOutputTypeCountHoldsArgs
  }

  // Custom InputTypes
  /**
   * TableCountOutputType without action
   */
  export type TableCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the TableCountOutputType
     */
    select?: TableCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * TableCountOutputType without action
   */
  export type TableCountOutputTypeCountReservationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationWhereInput
  }

  /**
   * TableCountOutputType without action
   */
  export type TableCountOutputTypeCountHoldsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationHoldWhereInput
  }


  /**
   * Count Type GuestCountOutputType
   */

  export type GuestCountOutputType = {
    reservations: number
  }

  export type GuestCountOutputTypeSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    reservations?: boolean | GuestCountOutputTypeCountReservationsArgs
  }

  // Custom InputTypes
  /**
   * GuestCountOutputType without action
   */
  export type GuestCountOutputTypeDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the GuestCountOutputType
     */
    select?: GuestCountOutputTypeSelect<ExtArgs> | null
  }

  /**
   * GuestCountOutputType without action
   */
  export type GuestCountOutputTypeCountReservationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationWhereInput
  }


  /**
   * Models
   */

  /**
   * Model VenueGroup
   */

  export type AggregateVenueGroup = {
    _count: VenueGroupCountAggregateOutputType | null
    _min: VenueGroupMinAggregateOutputType | null
    _max: VenueGroupMaxAggregateOutputType | null
  }

  export type VenueGroupMinAggregateOutputType = {
    id: string | null
    name: string | null
    slug: string | null
    createdAt: Date | null
  }

  export type VenueGroupMaxAggregateOutputType = {
    id: string | null
    name: string | null
    slug: string | null
    createdAt: Date | null
  }

  export type VenueGroupCountAggregateOutputType = {
    id: number
    name: number
    slug: number
    settings: number
    createdAt: number
    _all: number
  }


  export type VenueGroupMinAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    createdAt?: true
  }

  export type VenueGroupMaxAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    createdAt?: true
  }

  export type VenueGroupCountAggregateInputType = {
    id?: true
    name?: true
    slug?: true
    settings?: true
    createdAt?: true
    _all?: true
  }

  export type VenueGroupAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which VenueGroup to aggregate.
     */
    where?: VenueGroupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VenueGroups to fetch.
     */
    orderBy?: VenueGroupOrderByWithRelationInput | VenueGroupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: VenueGroupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VenueGroups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VenueGroups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned VenueGroups
    **/
    _count?: true | VenueGroupCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: VenueGroupMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: VenueGroupMaxAggregateInputType
  }

  export type GetVenueGroupAggregateType<T extends VenueGroupAggregateArgs> = {
        [P in keyof T & keyof AggregateVenueGroup]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateVenueGroup[P]>
      : GetScalarType<T[P], AggregateVenueGroup[P]>
  }




  export type VenueGroupGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: VenueGroupWhereInput
    orderBy?: VenueGroupOrderByWithAggregationInput | VenueGroupOrderByWithAggregationInput[]
    by: VenueGroupScalarFieldEnum[] | VenueGroupScalarFieldEnum
    having?: VenueGroupScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: VenueGroupCountAggregateInputType | true
    _min?: VenueGroupMinAggregateInputType
    _max?: VenueGroupMaxAggregateInputType
  }

  export type VenueGroupGroupByOutputType = {
    id: string
    name: string
    slug: string
    settings: JsonValue | null
    createdAt: Date
    _count: VenueGroupCountAggregateOutputType | null
    _min: VenueGroupMinAggregateOutputType | null
    _max: VenueGroupMaxAggregateOutputType | null
  }

  type GetVenueGroupGroupByPayload<T extends VenueGroupGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<VenueGroupGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof VenueGroupGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], VenueGroupGroupByOutputType[P]>
            : GetScalarType<T[P], VenueGroupGroupByOutputType[P]>
        }
      >
    >


  export type VenueGroupSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    settings?: boolean
    createdAt?: boolean
    venues?: boolean | VenueGroup$venuesArgs<ExtArgs>
    _count?: boolean | VenueGroupCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["venueGroup"]>

  export type VenueGroupSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    settings?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["venueGroup"]>

  export type VenueGroupSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    slug?: boolean
    settings?: boolean
    createdAt?: boolean
  }, ExtArgs["result"]["venueGroup"]>

  export type VenueGroupSelectScalar = {
    id?: boolean
    name?: boolean
    slug?: boolean
    settings?: boolean
    createdAt?: boolean
  }

  export type VenueGroupOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "slug" | "settings" | "createdAt", ExtArgs["result"]["venueGroup"]>
  export type VenueGroupInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venues?: boolean | VenueGroup$venuesArgs<ExtArgs>
    _count?: boolean | VenueGroupCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type VenueGroupIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}
  export type VenueGroupIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {}

  export type $VenueGroupPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "VenueGroup"
    objects: {
      venues: Prisma.$VenuePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      slug: string
      settings: Prisma.JsonValue | null
      createdAt: Date
    }, ExtArgs["result"]["venueGroup"]>
    composites: {}
  }

  type VenueGroupGetPayload<S extends boolean | null | undefined | VenueGroupDefaultArgs> = $Result.GetResult<Prisma.$VenueGroupPayload, S>

  type VenueGroupCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<VenueGroupFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: VenueGroupCountAggregateInputType | true
    }

  export interface VenueGroupDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['VenueGroup'], meta: { name: 'VenueGroup' } }
    /**
     * Find zero or one VenueGroup that matches the filter.
     * @param {VenueGroupFindUniqueArgs} args - Arguments to find a VenueGroup
     * @example
     * // Get one VenueGroup
     * const venueGroup = await prisma.venueGroup.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends VenueGroupFindUniqueArgs>(args: SelectSubset<T, VenueGroupFindUniqueArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one VenueGroup that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {VenueGroupFindUniqueOrThrowArgs} args - Arguments to find a VenueGroup
     * @example
     * // Get one VenueGroup
     * const venueGroup = await prisma.venueGroup.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends VenueGroupFindUniqueOrThrowArgs>(args: SelectSubset<T, VenueGroupFindUniqueOrThrowArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first VenueGroup that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupFindFirstArgs} args - Arguments to find a VenueGroup
     * @example
     * // Get one VenueGroup
     * const venueGroup = await prisma.venueGroup.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends VenueGroupFindFirstArgs>(args?: SelectSubset<T, VenueGroupFindFirstArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first VenueGroup that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupFindFirstOrThrowArgs} args - Arguments to find a VenueGroup
     * @example
     * // Get one VenueGroup
     * const venueGroup = await prisma.venueGroup.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends VenueGroupFindFirstOrThrowArgs>(args?: SelectSubset<T, VenueGroupFindFirstOrThrowArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more VenueGroups that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all VenueGroups
     * const venueGroups = await prisma.venueGroup.findMany()
     * 
     * // Get first 10 VenueGroups
     * const venueGroups = await prisma.venueGroup.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const venueGroupWithIdOnly = await prisma.venueGroup.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends VenueGroupFindManyArgs>(args?: SelectSubset<T, VenueGroupFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a VenueGroup.
     * @param {VenueGroupCreateArgs} args - Arguments to create a VenueGroup.
     * @example
     * // Create one VenueGroup
     * const VenueGroup = await prisma.venueGroup.create({
     *   data: {
     *     // ... data to create a VenueGroup
     *   }
     * })
     * 
     */
    create<T extends VenueGroupCreateArgs>(args: SelectSubset<T, VenueGroupCreateArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many VenueGroups.
     * @param {VenueGroupCreateManyArgs} args - Arguments to create many VenueGroups.
     * @example
     * // Create many VenueGroups
     * const venueGroup = await prisma.venueGroup.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends VenueGroupCreateManyArgs>(args?: SelectSubset<T, VenueGroupCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many VenueGroups and returns the data saved in the database.
     * @param {VenueGroupCreateManyAndReturnArgs} args - Arguments to create many VenueGroups.
     * @example
     * // Create many VenueGroups
     * const venueGroup = await prisma.venueGroup.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many VenueGroups and only return the `id`
     * const venueGroupWithIdOnly = await prisma.venueGroup.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends VenueGroupCreateManyAndReturnArgs>(args?: SelectSubset<T, VenueGroupCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a VenueGroup.
     * @param {VenueGroupDeleteArgs} args - Arguments to delete one VenueGroup.
     * @example
     * // Delete one VenueGroup
     * const VenueGroup = await prisma.venueGroup.delete({
     *   where: {
     *     // ... filter to delete one VenueGroup
     *   }
     * })
     * 
     */
    delete<T extends VenueGroupDeleteArgs>(args: SelectSubset<T, VenueGroupDeleteArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one VenueGroup.
     * @param {VenueGroupUpdateArgs} args - Arguments to update one VenueGroup.
     * @example
     * // Update one VenueGroup
     * const venueGroup = await prisma.venueGroup.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends VenueGroupUpdateArgs>(args: SelectSubset<T, VenueGroupUpdateArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more VenueGroups.
     * @param {VenueGroupDeleteManyArgs} args - Arguments to filter VenueGroups to delete.
     * @example
     * // Delete a few VenueGroups
     * const { count } = await prisma.venueGroup.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends VenueGroupDeleteManyArgs>(args?: SelectSubset<T, VenueGroupDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more VenueGroups.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many VenueGroups
     * const venueGroup = await prisma.venueGroup.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends VenueGroupUpdateManyArgs>(args: SelectSubset<T, VenueGroupUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more VenueGroups and returns the data updated in the database.
     * @param {VenueGroupUpdateManyAndReturnArgs} args - Arguments to update many VenueGroups.
     * @example
     * // Update many VenueGroups
     * const venueGroup = await prisma.venueGroup.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more VenueGroups and only return the `id`
     * const venueGroupWithIdOnly = await prisma.venueGroup.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends VenueGroupUpdateManyAndReturnArgs>(args: SelectSubset<T, VenueGroupUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one VenueGroup.
     * @param {VenueGroupUpsertArgs} args - Arguments to update or create a VenueGroup.
     * @example
     * // Update or create a VenueGroup
     * const venueGroup = await prisma.venueGroup.upsert({
     *   create: {
     *     // ... data to create a VenueGroup
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the VenueGroup we want to update
     *   }
     * })
     */
    upsert<T extends VenueGroupUpsertArgs>(args: SelectSubset<T, VenueGroupUpsertArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of VenueGroups.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupCountArgs} args - Arguments to filter VenueGroups to count.
     * @example
     * // Count the number of VenueGroups
     * const count = await prisma.venueGroup.count({
     *   where: {
     *     // ... the filter for the VenueGroups we want to count
     *   }
     * })
    **/
    count<T extends VenueGroupCountArgs>(
      args?: Subset<T, VenueGroupCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], VenueGroupCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a VenueGroup.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends VenueGroupAggregateArgs>(args: Subset<T, VenueGroupAggregateArgs>): Prisma.PrismaPromise<GetVenueGroupAggregateType<T>>

    /**
     * Group by VenueGroup.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends VenueGroupGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: VenueGroupGroupByArgs['orderBy'] }
        : { orderBy?: VenueGroupGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, VenueGroupGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetVenueGroupGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the VenueGroup model
   */
  readonly fields: VenueGroupFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for VenueGroup.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__VenueGroupClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    venues<T extends VenueGroup$venuesArgs<ExtArgs> = {}>(args?: Subset<T, VenueGroup$venuesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the VenueGroup model
   */
  interface VenueGroupFieldRefs {
    readonly id: FieldRef<"VenueGroup", 'String'>
    readonly name: FieldRef<"VenueGroup", 'String'>
    readonly slug: FieldRef<"VenueGroup", 'String'>
    readonly settings: FieldRef<"VenueGroup", 'Json'>
    readonly createdAt: FieldRef<"VenueGroup", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * VenueGroup findUnique
   */
  export type VenueGroupFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * Filter, which VenueGroup to fetch.
     */
    where: VenueGroupWhereUniqueInput
  }

  /**
   * VenueGroup findUniqueOrThrow
   */
  export type VenueGroupFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * Filter, which VenueGroup to fetch.
     */
    where: VenueGroupWhereUniqueInput
  }

  /**
   * VenueGroup findFirst
   */
  export type VenueGroupFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * Filter, which VenueGroup to fetch.
     */
    where?: VenueGroupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VenueGroups to fetch.
     */
    orderBy?: VenueGroupOrderByWithRelationInput | VenueGroupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for VenueGroups.
     */
    cursor?: VenueGroupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VenueGroups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VenueGroups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of VenueGroups.
     */
    distinct?: VenueGroupScalarFieldEnum | VenueGroupScalarFieldEnum[]
  }

  /**
   * VenueGroup findFirstOrThrow
   */
  export type VenueGroupFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * Filter, which VenueGroup to fetch.
     */
    where?: VenueGroupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VenueGroups to fetch.
     */
    orderBy?: VenueGroupOrderByWithRelationInput | VenueGroupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for VenueGroups.
     */
    cursor?: VenueGroupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VenueGroups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VenueGroups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of VenueGroups.
     */
    distinct?: VenueGroupScalarFieldEnum | VenueGroupScalarFieldEnum[]
  }

  /**
   * VenueGroup findMany
   */
  export type VenueGroupFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * Filter, which VenueGroups to fetch.
     */
    where?: VenueGroupWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of VenueGroups to fetch.
     */
    orderBy?: VenueGroupOrderByWithRelationInput | VenueGroupOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing VenueGroups.
     */
    cursor?: VenueGroupWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` VenueGroups from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` VenueGroups.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of VenueGroups.
     */
    distinct?: VenueGroupScalarFieldEnum | VenueGroupScalarFieldEnum[]
  }

  /**
   * VenueGroup create
   */
  export type VenueGroupCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * The data needed to create a VenueGroup.
     */
    data: XOR<VenueGroupCreateInput, VenueGroupUncheckedCreateInput>
  }

  /**
   * VenueGroup createMany
   */
  export type VenueGroupCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many VenueGroups.
     */
    data: VenueGroupCreateManyInput | VenueGroupCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * VenueGroup createManyAndReturn
   */
  export type VenueGroupCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * The data used to create many VenueGroups.
     */
    data: VenueGroupCreateManyInput | VenueGroupCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * VenueGroup update
   */
  export type VenueGroupUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * The data needed to update a VenueGroup.
     */
    data: XOR<VenueGroupUpdateInput, VenueGroupUncheckedUpdateInput>
    /**
     * Choose, which VenueGroup to update.
     */
    where: VenueGroupWhereUniqueInput
  }

  /**
   * VenueGroup updateMany
   */
  export type VenueGroupUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update VenueGroups.
     */
    data: XOR<VenueGroupUpdateManyMutationInput, VenueGroupUncheckedUpdateManyInput>
    /**
     * Filter which VenueGroups to update
     */
    where?: VenueGroupWhereInput
    /**
     * Limit how many VenueGroups to update.
     */
    limit?: number
  }

  /**
   * VenueGroup updateManyAndReturn
   */
  export type VenueGroupUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * The data used to update VenueGroups.
     */
    data: XOR<VenueGroupUpdateManyMutationInput, VenueGroupUncheckedUpdateManyInput>
    /**
     * Filter which VenueGroups to update
     */
    where?: VenueGroupWhereInput
    /**
     * Limit how many VenueGroups to update.
     */
    limit?: number
  }

  /**
   * VenueGroup upsert
   */
  export type VenueGroupUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * The filter to search for the VenueGroup to update in case it exists.
     */
    where: VenueGroupWhereUniqueInput
    /**
     * In case the VenueGroup found by the `where` argument doesn't exist, create a new VenueGroup with this data.
     */
    create: XOR<VenueGroupCreateInput, VenueGroupUncheckedCreateInput>
    /**
     * In case the VenueGroup was found with the provided `where` argument, update it with this data.
     */
    update: XOR<VenueGroupUpdateInput, VenueGroupUncheckedUpdateInput>
  }

  /**
   * VenueGroup delete
   */
  export type VenueGroupDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    /**
     * Filter which VenueGroup to delete.
     */
    where: VenueGroupWhereUniqueInput
  }

  /**
   * VenueGroup deleteMany
   */
  export type VenueGroupDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which VenueGroups to delete
     */
    where?: VenueGroupWhereInput
    /**
     * Limit how many VenueGroups to delete.
     */
    limit?: number
  }

  /**
   * VenueGroup.venues
   */
  export type VenueGroup$venuesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    where?: VenueWhereInput
    orderBy?: VenueOrderByWithRelationInput | VenueOrderByWithRelationInput[]
    cursor?: VenueWhereUniqueInput
    take?: number
    skip?: number
    distinct?: VenueScalarFieldEnum | VenueScalarFieldEnum[]
  }

  /**
   * VenueGroup without action
   */
  export type VenueGroupDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
  }


  /**
   * Model Venue
   */

  export type AggregateVenue = {
    _count: VenueCountAggregateOutputType | null
    _avg: VenueAvgAggregateOutputType | null
    _sum: VenueSumAggregateOutputType | null
    _min: VenueMinAggregateOutputType | null
    _max: VenueMaxAggregateOutputType | null
  }

  export type VenueAvgAggregateOutputType = {
    depositAmountCents: number | null
    freeCancellationHours: number | null
    lateCancellationFeePercent: number | null
    noShowFeePercent: number | null
  }

  export type VenueSumAggregateOutputType = {
    depositAmountCents: number | null
    freeCancellationHours: number | null
    lateCancellationFeePercent: number | null
    noShowFeePercent: number | null
  }

  export type VenueMinAggregateOutputType = {
    id: string | null
    venueGroupId: string | null
    name: string | null
    slug: string | null
    ianaTimezone: string | null
    currencyCode: string | null
    depositEnabled: boolean | null
    depositType: $Enums.DepositType | null
    depositAmountCents: number | null
    freeCancellationHours: number | null
    lateCancellationFeePercent: number | null
    noShowFeePercent: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type VenueMaxAggregateOutputType = {
    id: string | null
    venueGroupId: string | null
    name: string | null
    slug: string | null
    ianaTimezone: string | null
    currencyCode: string | null
    depositEnabled: boolean | null
    depositType: $Enums.DepositType | null
    depositAmountCents: number | null
    freeCancellationHours: number | null
    lateCancellationFeePercent: number | null
    noShowFeePercent: number | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type VenueCountAggregateOutputType = {
    id: number
    venueGroupId: number
    name: number
    slug: number
    ianaTimezone: number
    currencyCode: number
    operatingHours: number
    settings: number
    depositEnabled: number
    depositType: number
    depositAmountCents: number
    freeCancellationHours: number
    lateCancellationFeePercent: number
    noShowFeePercent: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type VenueAvgAggregateInputType = {
    depositAmountCents?: true
    freeCancellationHours?: true
    lateCancellationFeePercent?: true
    noShowFeePercent?: true
  }

  export type VenueSumAggregateInputType = {
    depositAmountCents?: true
    freeCancellationHours?: true
    lateCancellationFeePercent?: true
    noShowFeePercent?: true
  }

  export type VenueMinAggregateInputType = {
    id?: true
    venueGroupId?: true
    name?: true
    slug?: true
    ianaTimezone?: true
    currencyCode?: true
    depositEnabled?: true
    depositType?: true
    depositAmountCents?: true
    freeCancellationHours?: true
    lateCancellationFeePercent?: true
    noShowFeePercent?: true
    createdAt?: true
    updatedAt?: true
  }

  export type VenueMaxAggregateInputType = {
    id?: true
    venueGroupId?: true
    name?: true
    slug?: true
    ianaTimezone?: true
    currencyCode?: true
    depositEnabled?: true
    depositType?: true
    depositAmountCents?: true
    freeCancellationHours?: true
    lateCancellationFeePercent?: true
    noShowFeePercent?: true
    createdAt?: true
    updatedAt?: true
  }

  export type VenueCountAggregateInputType = {
    id?: true
    venueGroupId?: true
    name?: true
    slug?: true
    ianaTimezone?: true
    currencyCode?: true
    operatingHours?: true
    settings?: true
    depositEnabled?: true
    depositType?: true
    depositAmountCents?: true
    freeCancellationHours?: true
    lateCancellationFeePercent?: true
    noShowFeePercent?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type VenueAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Venue to aggregate.
     */
    where?: VenueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Venues to fetch.
     */
    orderBy?: VenueOrderByWithRelationInput | VenueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: VenueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Venues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Venues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Venues
    **/
    _count?: true | VenueCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: VenueAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: VenueSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: VenueMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: VenueMaxAggregateInputType
  }

  export type GetVenueAggregateType<T extends VenueAggregateArgs> = {
        [P in keyof T & keyof AggregateVenue]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateVenue[P]>
      : GetScalarType<T[P], AggregateVenue[P]>
  }




  export type VenueGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: VenueWhereInput
    orderBy?: VenueOrderByWithAggregationInput | VenueOrderByWithAggregationInput[]
    by: VenueScalarFieldEnum[] | VenueScalarFieldEnum
    having?: VenueScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: VenueCountAggregateInputType | true
    _avg?: VenueAvgAggregateInputType
    _sum?: VenueSumAggregateInputType
    _min?: VenueMinAggregateInputType
    _max?: VenueMaxAggregateInputType
  }

  export type VenueGroupByOutputType = {
    id: string
    venueGroupId: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode: string
    operatingHours: JsonValue | null
    settings: JsonValue | null
    depositEnabled: boolean
    depositType: $Enums.DepositType | null
    depositAmountCents: number | null
    freeCancellationHours: number | null
    lateCancellationFeePercent: number | null
    noShowFeePercent: number | null
    createdAt: Date
    updatedAt: Date
    _count: VenueCountAggregateOutputType | null
    _avg: VenueAvgAggregateOutputType | null
    _sum: VenueSumAggregateOutputType | null
    _min: VenueMinAggregateOutputType | null
    _max: VenueMaxAggregateOutputType | null
  }

  type GetVenueGroupByPayload<T extends VenueGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<VenueGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof VenueGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], VenueGroupByOutputType[P]>
            : GetScalarType<T[P], VenueGroupByOutputType[P]>
        }
      >
    >


  export type VenueSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueGroupId?: boolean
    name?: boolean
    slug?: boolean
    ianaTimezone?: boolean
    currencyCode?: boolean
    operatingHours?: boolean
    settings?: boolean
    depositEnabled?: boolean
    depositType?: boolean
    depositAmountCents?: boolean
    freeCancellationHours?: boolean
    lateCancellationFeePercent?: boolean
    noShowFeePercent?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venueGroup?: boolean | Venue$venueGroupArgs<ExtArgs>
    tables?: boolean | Venue$tablesArgs<ExtArgs>
    reservations?: boolean | Venue$reservationsArgs<ExtArgs>
    guests?: boolean | Venue$guestsArgs<ExtArgs>
    floorPlans?: boolean | Venue$floorPlansArgs<ExtArgs>
    holds?: boolean | Venue$holdsArgs<ExtArgs>
    _count?: boolean | VenueCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["venue"]>

  export type VenueSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueGroupId?: boolean
    name?: boolean
    slug?: boolean
    ianaTimezone?: boolean
    currencyCode?: boolean
    operatingHours?: boolean
    settings?: boolean
    depositEnabled?: boolean
    depositType?: boolean
    depositAmountCents?: boolean
    freeCancellationHours?: boolean
    lateCancellationFeePercent?: boolean
    noShowFeePercent?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venueGroup?: boolean | Venue$venueGroupArgs<ExtArgs>
  }, ExtArgs["result"]["venue"]>

  export type VenueSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueGroupId?: boolean
    name?: boolean
    slug?: boolean
    ianaTimezone?: boolean
    currencyCode?: boolean
    operatingHours?: boolean
    settings?: boolean
    depositEnabled?: boolean
    depositType?: boolean
    depositAmountCents?: boolean
    freeCancellationHours?: boolean
    lateCancellationFeePercent?: boolean
    noShowFeePercent?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venueGroup?: boolean | Venue$venueGroupArgs<ExtArgs>
  }, ExtArgs["result"]["venue"]>

  export type VenueSelectScalar = {
    id?: boolean
    venueGroupId?: boolean
    name?: boolean
    slug?: boolean
    ianaTimezone?: boolean
    currencyCode?: boolean
    operatingHours?: boolean
    settings?: boolean
    depositEnabled?: boolean
    depositType?: boolean
    depositAmountCents?: boolean
    freeCancellationHours?: boolean
    lateCancellationFeePercent?: boolean
    noShowFeePercent?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type VenueOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "venueGroupId" | "name" | "slug" | "ianaTimezone" | "currencyCode" | "operatingHours" | "settings" | "depositEnabled" | "depositType" | "depositAmountCents" | "freeCancellationHours" | "lateCancellationFeePercent" | "noShowFeePercent" | "createdAt" | "updatedAt", ExtArgs["result"]["venue"]>
  export type VenueInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venueGroup?: boolean | Venue$venueGroupArgs<ExtArgs>
    tables?: boolean | Venue$tablesArgs<ExtArgs>
    reservations?: boolean | Venue$reservationsArgs<ExtArgs>
    guests?: boolean | Venue$guestsArgs<ExtArgs>
    floorPlans?: boolean | Venue$floorPlansArgs<ExtArgs>
    holds?: boolean | Venue$holdsArgs<ExtArgs>
    _count?: boolean | VenueCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type VenueIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venueGroup?: boolean | Venue$venueGroupArgs<ExtArgs>
  }
  export type VenueIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venueGroup?: boolean | Venue$venueGroupArgs<ExtArgs>
  }

  export type $VenuePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Venue"
    objects: {
      venueGroup: Prisma.$VenueGroupPayload<ExtArgs> | null
      tables: Prisma.$TablePayload<ExtArgs>[]
      reservations: Prisma.$ReservationPayload<ExtArgs>[]
      guests: Prisma.$GuestPayload<ExtArgs>[]
      floorPlans: Prisma.$FloorPlanPayload<ExtArgs>[]
      holds: Prisma.$ReservationHoldPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      venueGroupId: string | null
      name: string
      slug: string
      ianaTimezone: string
      currencyCode: string
      operatingHours: Prisma.JsonValue | null
      settings: Prisma.JsonValue | null
      depositEnabled: boolean
      depositType: $Enums.DepositType | null
      depositAmountCents: number | null
      freeCancellationHours: number | null
      lateCancellationFeePercent: number | null
      noShowFeePercent: number | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["venue"]>
    composites: {}
  }

  type VenueGetPayload<S extends boolean | null | undefined | VenueDefaultArgs> = $Result.GetResult<Prisma.$VenuePayload, S>

  type VenueCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<VenueFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: VenueCountAggregateInputType | true
    }

  export interface VenueDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Venue'], meta: { name: 'Venue' } }
    /**
     * Find zero or one Venue that matches the filter.
     * @param {VenueFindUniqueArgs} args - Arguments to find a Venue
     * @example
     * // Get one Venue
     * const venue = await prisma.venue.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends VenueFindUniqueArgs>(args: SelectSubset<T, VenueFindUniqueArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Venue that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {VenueFindUniqueOrThrowArgs} args - Arguments to find a Venue
     * @example
     * // Get one Venue
     * const venue = await prisma.venue.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends VenueFindUniqueOrThrowArgs>(args: SelectSubset<T, VenueFindUniqueOrThrowArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Venue that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueFindFirstArgs} args - Arguments to find a Venue
     * @example
     * // Get one Venue
     * const venue = await prisma.venue.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends VenueFindFirstArgs>(args?: SelectSubset<T, VenueFindFirstArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Venue that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueFindFirstOrThrowArgs} args - Arguments to find a Venue
     * @example
     * // Get one Venue
     * const venue = await prisma.venue.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends VenueFindFirstOrThrowArgs>(args?: SelectSubset<T, VenueFindFirstOrThrowArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Venues that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Venues
     * const venues = await prisma.venue.findMany()
     * 
     * // Get first 10 Venues
     * const venues = await prisma.venue.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const venueWithIdOnly = await prisma.venue.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends VenueFindManyArgs>(args?: SelectSubset<T, VenueFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Venue.
     * @param {VenueCreateArgs} args - Arguments to create a Venue.
     * @example
     * // Create one Venue
     * const Venue = await prisma.venue.create({
     *   data: {
     *     // ... data to create a Venue
     *   }
     * })
     * 
     */
    create<T extends VenueCreateArgs>(args: SelectSubset<T, VenueCreateArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Venues.
     * @param {VenueCreateManyArgs} args - Arguments to create many Venues.
     * @example
     * // Create many Venues
     * const venue = await prisma.venue.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends VenueCreateManyArgs>(args?: SelectSubset<T, VenueCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Venues and returns the data saved in the database.
     * @param {VenueCreateManyAndReturnArgs} args - Arguments to create many Venues.
     * @example
     * // Create many Venues
     * const venue = await prisma.venue.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Venues and only return the `id`
     * const venueWithIdOnly = await prisma.venue.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends VenueCreateManyAndReturnArgs>(args?: SelectSubset<T, VenueCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Venue.
     * @param {VenueDeleteArgs} args - Arguments to delete one Venue.
     * @example
     * // Delete one Venue
     * const Venue = await prisma.venue.delete({
     *   where: {
     *     // ... filter to delete one Venue
     *   }
     * })
     * 
     */
    delete<T extends VenueDeleteArgs>(args: SelectSubset<T, VenueDeleteArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Venue.
     * @param {VenueUpdateArgs} args - Arguments to update one Venue.
     * @example
     * // Update one Venue
     * const venue = await prisma.venue.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends VenueUpdateArgs>(args: SelectSubset<T, VenueUpdateArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Venues.
     * @param {VenueDeleteManyArgs} args - Arguments to filter Venues to delete.
     * @example
     * // Delete a few Venues
     * const { count } = await prisma.venue.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends VenueDeleteManyArgs>(args?: SelectSubset<T, VenueDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Venues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Venues
     * const venue = await prisma.venue.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends VenueUpdateManyArgs>(args: SelectSubset<T, VenueUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Venues and returns the data updated in the database.
     * @param {VenueUpdateManyAndReturnArgs} args - Arguments to update many Venues.
     * @example
     * // Update many Venues
     * const venue = await prisma.venue.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Venues and only return the `id`
     * const venueWithIdOnly = await prisma.venue.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends VenueUpdateManyAndReturnArgs>(args: SelectSubset<T, VenueUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Venue.
     * @param {VenueUpsertArgs} args - Arguments to update or create a Venue.
     * @example
     * // Update or create a Venue
     * const venue = await prisma.venue.upsert({
     *   create: {
     *     // ... data to create a Venue
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Venue we want to update
     *   }
     * })
     */
    upsert<T extends VenueUpsertArgs>(args: SelectSubset<T, VenueUpsertArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Venues.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueCountArgs} args - Arguments to filter Venues to count.
     * @example
     * // Count the number of Venues
     * const count = await prisma.venue.count({
     *   where: {
     *     // ... the filter for the Venues we want to count
     *   }
     * })
    **/
    count<T extends VenueCountArgs>(
      args?: Subset<T, VenueCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], VenueCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Venue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends VenueAggregateArgs>(args: Subset<T, VenueAggregateArgs>): Prisma.PrismaPromise<GetVenueAggregateType<T>>

    /**
     * Group by Venue.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {VenueGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends VenueGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: VenueGroupByArgs['orderBy'] }
        : { orderBy?: VenueGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, VenueGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetVenueGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Venue model
   */
  readonly fields: VenueFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Venue.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__VenueClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    venueGroup<T extends Venue$venueGroupArgs<ExtArgs> = {}>(args?: Subset<T, Venue$venueGroupArgs<ExtArgs>>): Prisma__VenueGroupClient<$Result.GetResult<Prisma.$VenueGroupPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    tables<T extends Venue$tablesArgs<ExtArgs> = {}>(args?: Subset<T, Venue$tablesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    reservations<T extends Venue$reservationsArgs<ExtArgs> = {}>(args?: Subset<T, Venue$reservationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    guests<T extends Venue$guestsArgs<ExtArgs> = {}>(args?: Subset<T, Venue$guestsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    floorPlans<T extends Venue$floorPlansArgs<ExtArgs> = {}>(args?: Subset<T, Venue$floorPlansArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    holds<T extends Venue$holdsArgs<ExtArgs> = {}>(args?: Subset<T, Venue$holdsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Venue model
   */
  interface VenueFieldRefs {
    readonly id: FieldRef<"Venue", 'String'>
    readonly venueGroupId: FieldRef<"Venue", 'String'>
    readonly name: FieldRef<"Venue", 'String'>
    readonly slug: FieldRef<"Venue", 'String'>
    readonly ianaTimezone: FieldRef<"Venue", 'String'>
    readonly currencyCode: FieldRef<"Venue", 'String'>
    readonly operatingHours: FieldRef<"Venue", 'Json'>
    readonly settings: FieldRef<"Venue", 'Json'>
    readonly depositEnabled: FieldRef<"Venue", 'Boolean'>
    readonly depositType: FieldRef<"Venue", 'DepositType'>
    readonly depositAmountCents: FieldRef<"Venue", 'Int'>
    readonly freeCancellationHours: FieldRef<"Venue", 'Int'>
    readonly lateCancellationFeePercent: FieldRef<"Venue", 'Int'>
    readonly noShowFeePercent: FieldRef<"Venue", 'Int'>
    readonly createdAt: FieldRef<"Venue", 'DateTime'>
    readonly updatedAt: FieldRef<"Venue", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Venue findUnique
   */
  export type VenueFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * Filter, which Venue to fetch.
     */
    where: VenueWhereUniqueInput
  }

  /**
   * Venue findUniqueOrThrow
   */
  export type VenueFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * Filter, which Venue to fetch.
     */
    where: VenueWhereUniqueInput
  }

  /**
   * Venue findFirst
   */
  export type VenueFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * Filter, which Venue to fetch.
     */
    where?: VenueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Venues to fetch.
     */
    orderBy?: VenueOrderByWithRelationInput | VenueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Venues.
     */
    cursor?: VenueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Venues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Venues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Venues.
     */
    distinct?: VenueScalarFieldEnum | VenueScalarFieldEnum[]
  }

  /**
   * Venue findFirstOrThrow
   */
  export type VenueFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * Filter, which Venue to fetch.
     */
    where?: VenueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Venues to fetch.
     */
    orderBy?: VenueOrderByWithRelationInput | VenueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Venues.
     */
    cursor?: VenueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Venues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Venues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Venues.
     */
    distinct?: VenueScalarFieldEnum | VenueScalarFieldEnum[]
  }

  /**
   * Venue findMany
   */
  export type VenueFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * Filter, which Venues to fetch.
     */
    where?: VenueWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Venues to fetch.
     */
    orderBy?: VenueOrderByWithRelationInput | VenueOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Venues.
     */
    cursor?: VenueWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Venues from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Venues.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Venues.
     */
    distinct?: VenueScalarFieldEnum | VenueScalarFieldEnum[]
  }

  /**
   * Venue create
   */
  export type VenueCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * The data needed to create a Venue.
     */
    data: XOR<VenueCreateInput, VenueUncheckedCreateInput>
  }

  /**
   * Venue createMany
   */
  export type VenueCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Venues.
     */
    data: VenueCreateManyInput | VenueCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Venue createManyAndReturn
   */
  export type VenueCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * The data used to create many Venues.
     */
    data: VenueCreateManyInput | VenueCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Venue update
   */
  export type VenueUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * The data needed to update a Venue.
     */
    data: XOR<VenueUpdateInput, VenueUncheckedUpdateInput>
    /**
     * Choose, which Venue to update.
     */
    where: VenueWhereUniqueInput
  }

  /**
   * Venue updateMany
   */
  export type VenueUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Venues.
     */
    data: XOR<VenueUpdateManyMutationInput, VenueUncheckedUpdateManyInput>
    /**
     * Filter which Venues to update
     */
    where?: VenueWhereInput
    /**
     * Limit how many Venues to update.
     */
    limit?: number
  }

  /**
   * Venue updateManyAndReturn
   */
  export type VenueUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * The data used to update Venues.
     */
    data: XOR<VenueUpdateManyMutationInput, VenueUncheckedUpdateManyInput>
    /**
     * Filter which Venues to update
     */
    where?: VenueWhereInput
    /**
     * Limit how many Venues to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Venue upsert
   */
  export type VenueUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * The filter to search for the Venue to update in case it exists.
     */
    where: VenueWhereUniqueInput
    /**
     * In case the Venue found by the `where` argument doesn't exist, create a new Venue with this data.
     */
    create: XOR<VenueCreateInput, VenueUncheckedCreateInput>
    /**
     * In case the Venue was found with the provided `where` argument, update it with this data.
     */
    update: XOR<VenueUpdateInput, VenueUncheckedUpdateInput>
  }

  /**
   * Venue delete
   */
  export type VenueDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    /**
     * Filter which Venue to delete.
     */
    where: VenueWhereUniqueInput
  }

  /**
   * Venue deleteMany
   */
  export type VenueDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Venues to delete
     */
    where?: VenueWhereInput
    /**
     * Limit how many Venues to delete.
     */
    limit?: number
  }

  /**
   * Venue.venueGroup
   */
  export type Venue$venueGroupArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the VenueGroup
     */
    select?: VenueGroupSelect<ExtArgs> | null
    /**
     * Omit specific fields from the VenueGroup
     */
    omit?: VenueGroupOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueGroupInclude<ExtArgs> | null
    where?: VenueGroupWhereInput
  }

  /**
   * Venue.tables
   */
  export type Venue$tablesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    where?: TableWhereInput
    orderBy?: TableOrderByWithRelationInput | TableOrderByWithRelationInput[]
    cursor?: TableWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TableScalarFieldEnum | TableScalarFieldEnum[]
  }

  /**
   * Venue.reservations
   */
  export type Venue$reservationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    where?: ReservationWhereInput
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    cursor?: ReservationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ReservationScalarFieldEnum | ReservationScalarFieldEnum[]
  }

  /**
   * Venue.guests
   */
  export type Venue$guestsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    where?: GuestWhereInput
    orderBy?: GuestOrderByWithRelationInput | GuestOrderByWithRelationInput[]
    cursor?: GuestWhereUniqueInput
    take?: number
    skip?: number
    distinct?: GuestScalarFieldEnum | GuestScalarFieldEnum[]
  }

  /**
   * Venue.floorPlans
   */
  export type Venue$floorPlansArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    where?: FloorPlanWhereInput
    orderBy?: FloorPlanOrderByWithRelationInput | FloorPlanOrderByWithRelationInput[]
    cursor?: FloorPlanWhereUniqueInput
    take?: number
    skip?: number
    distinct?: FloorPlanScalarFieldEnum | FloorPlanScalarFieldEnum[]
  }

  /**
   * Venue.holds
   */
  export type Venue$holdsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    where?: ReservationHoldWhereInput
    orderBy?: ReservationHoldOrderByWithRelationInput | ReservationHoldOrderByWithRelationInput[]
    cursor?: ReservationHoldWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ReservationHoldScalarFieldEnum | ReservationHoldScalarFieldEnum[]
  }

  /**
   * Venue without action
   */
  export type VenueDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
  }


  /**
   * Model FloorPlan
   */

  export type AggregateFloorPlan = {
    _count: FloorPlanCountAggregateOutputType | null
    _min: FloorPlanMinAggregateOutputType | null
    _max: FloorPlanMaxAggregateOutputType | null
  }

  export type FloorPlanMinAggregateOutputType = {
    id: string | null
    venueId: string | null
    name: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type FloorPlanMaxAggregateOutputType = {
    id: string | null
    venueId: string | null
    name: string | null
    isActive: boolean | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type FloorPlanCountAggregateOutputType = {
    id: number
    venueId: number
    name: number
    isActive: number
    layoutJson: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type FloorPlanMinAggregateInputType = {
    id?: true
    venueId?: true
    name?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type FloorPlanMaxAggregateInputType = {
    id?: true
    venueId?: true
    name?: true
    isActive?: true
    createdAt?: true
    updatedAt?: true
  }

  export type FloorPlanCountAggregateInputType = {
    id?: true
    venueId?: true
    name?: true
    isActive?: true
    layoutJson?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type FloorPlanAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which FloorPlan to aggregate.
     */
    where?: FloorPlanWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of FloorPlans to fetch.
     */
    orderBy?: FloorPlanOrderByWithRelationInput | FloorPlanOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: FloorPlanWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` FloorPlans from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` FloorPlans.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned FloorPlans
    **/
    _count?: true | FloorPlanCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: FloorPlanMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: FloorPlanMaxAggregateInputType
  }

  export type GetFloorPlanAggregateType<T extends FloorPlanAggregateArgs> = {
        [P in keyof T & keyof AggregateFloorPlan]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateFloorPlan[P]>
      : GetScalarType<T[P], AggregateFloorPlan[P]>
  }




  export type FloorPlanGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: FloorPlanWhereInput
    orderBy?: FloorPlanOrderByWithAggregationInput | FloorPlanOrderByWithAggregationInput[]
    by: FloorPlanScalarFieldEnum[] | FloorPlanScalarFieldEnum
    having?: FloorPlanScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: FloorPlanCountAggregateInputType | true
    _min?: FloorPlanMinAggregateInputType
    _max?: FloorPlanMaxAggregateInputType
  }

  export type FloorPlanGroupByOutputType = {
    id: string
    venueId: string
    name: string
    isActive: boolean
    layoutJson: JsonValue
    createdAt: Date
    updatedAt: Date
    _count: FloorPlanCountAggregateOutputType | null
    _min: FloorPlanMinAggregateOutputType | null
    _max: FloorPlanMaxAggregateOutputType | null
  }

  type GetFloorPlanGroupByPayload<T extends FloorPlanGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<FloorPlanGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof FloorPlanGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], FloorPlanGroupByOutputType[P]>
            : GetScalarType<T[P], FloorPlanGroupByOutputType[P]>
        }
      >
    >


  export type FloorPlanSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    name?: boolean
    isActive?: boolean
    layoutJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    tables?: boolean | FloorPlan$tablesArgs<ExtArgs>
    _count?: boolean | FloorPlanCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["floorPlan"]>

  export type FloorPlanSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    name?: boolean
    isActive?: boolean
    layoutJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["floorPlan"]>

  export type FloorPlanSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    name?: boolean
    isActive?: boolean
    layoutJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["floorPlan"]>

  export type FloorPlanSelectScalar = {
    id?: boolean
    venueId?: boolean
    name?: boolean
    isActive?: boolean
    layoutJson?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type FloorPlanOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "venueId" | "name" | "isActive" | "layoutJson" | "createdAt" | "updatedAt", ExtArgs["result"]["floorPlan"]>
  export type FloorPlanInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    tables?: boolean | FloorPlan$tablesArgs<ExtArgs>
    _count?: boolean | FloorPlanCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type FloorPlanIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }
  export type FloorPlanIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }

  export type $FloorPlanPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "FloorPlan"
    objects: {
      venue: Prisma.$VenuePayload<ExtArgs>
      tables: Prisma.$TablePayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      venueId: string
      name: string
      isActive: boolean
      layoutJson: Prisma.JsonValue
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["floorPlan"]>
    composites: {}
  }

  type FloorPlanGetPayload<S extends boolean | null | undefined | FloorPlanDefaultArgs> = $Result.GetResult<Prisma.$FloorPlanPayload, S>

  type FloorPlanCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<FloorPlanFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: FloorPlanCountAggregateInputType | true
    }

  export interface FloorPlanDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['FloorPlan'], meta: { name: 'FloorPlan' } }
    /**
     * Find zero or one FloorPlan that matches the filter.
     * @param {FloorPlanFindUniqueArgs} args - Arguments to find a FloorPlan
     * @example
     * // Get one FloorPlan
     * const floorPlan = await prisma.floorPlan.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends FloorPlanFindUniqueArgs>(args: SelectSubset<T, FloorPlanFindUniqueArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one FloorPlan that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {FloorPlanFindUniqueOrThrowArgs} args - Arguments to find a FloorPlan
     * @example
     * // Get one FloorPlan
     * const floorPlan = await prisma.floorPlan.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends FloorPlanFindUniqueOrThrowArgs>(args: SelectSubset<T, FloorPlanFindUniqueOrThrowArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first FloorPlan that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanFindFirstArgs} args - Arguments to find a FloorPlan
     * @example
     * // Get one FloorPlan
     * const floorPlan = await prisma.floorPlan.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends FloorPlanFindFirstArgs>(args?: SelectSubset<T, FloorPlanFindFirstArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first FloorPlan that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanFindFirstOrThrowArgs} args - Arguments to find a FloorPlan
     * @example
     * // Get one FloorPlan
     * const floorPlan = await prisma.floorPlan.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends FloorPlanFindFirstOrThrowArgs>(args?: SelectSubset<T, FloorPlanFindFirstOrThrowArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more FloorPlans that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all FloorPlans
     * const floorPlans = await prisma.floorPlan.findMany()
     * 
     * // Get first 10 FloorPlans
     * const floorPlans = await prisma.floorPlan.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const floorPlanWithIdOnly = await prisma.floorPlan.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends FloorPlanFindManyArgs>(args?: SelectSubset<T, FloorPlanFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a FloorPlan.
     * @param {FloorPlanCreateArgs} args - Arguments to create a FloorPlan.
     * @example
     * // Create one FloorPlan
     * const FloorPlan = await prisma.floorPlan.create({
     *   data: {
     *     // ... data to create a FloorPlan
     *   }
     * })
     * 
     */
    create<T extends FloorPlanCreateArgs>(args: SelectSubset<T, FloorPlanCreateArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many FloorPlans.
     * @param {FloorPlanCreateManyArgs} args - Arguments to create many FloorPlans.
     * @example
     * // Create many FloorPlans
     * const floorPlan = await prisma.floorPlan.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends FloorPlanCreateManyArgs>(args?: SelectSubset<T, FloorPlanCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many FloorPlans and returns the data saved in the database.
     * @param {FloorPlanCreateManyAndReturnArgs} args - Arguments to create many FloorPlans.
     * @example
     * // Create many FloorPlans
     * const floorPlan = await prisma.floorPlan.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many FloorPlans and only return the `id`
     * const floorPlanWithIdOnly = await prisma.floorPlan.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends FloorPlanCreateManyAndReturnArgs>(args?: SelectSubset<T, FloorPlanCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a FloorPlan.
     * @param {FloorPlanDeleteArgs} args - Arguments to delete one FloorPlan.
     * @example
     * // Delete one FloorPlan
     * const FloorPlan = await prisma.floorPlan.delete({
     *   where: {
     *     // ... filter to delete one FloorPlan
     *   }
     * })
     * 
     */
    delete<T extends FloorPlanDeleteArgs>(args: SelectSubset<T, FloorPlanDeleteArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one FloorPlan.
     * @param {FloorPlanUpdateArgs} args - Arguments to update one FloorPlan.
     * @example
     * // Update one FloorPlan
     * const floorPlan = await prisma.floorPlan.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends FloorPlanUpdateArgs>(args: SelectSubset<T, FloorPlanUpdateArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more FloorPlans.
     * @param {FloorPlanDeleteManyArgs} args - Arguments to filter FloorPlans to delete.
     * @example
     * // Delete a few FloorPlans
     * const { count } = await prisma.floorPlan.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends FloorPlanDeleteManyArgs>(args?: SelectSubset<T, FloorPlanDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more FloorPlans.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many FloorPlans
     * const floorPlan = await prisma.floorPlan.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends FloorPlanUpdateManyArgs>(args: SelectSubset<T, FloorPlanUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more FloorPlans and returns the data updated in the database.
     * @param {FloorPlanUpdateManyAndReturnArgs} args - Arguments to update many FloorPlans.
     * @example
     * // Update many FloorPlans
     * const floorPlan = await prisma.floorPlan.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more FloorPlans and only return the `id`
     * const floorPlanWithIdOnly = await prisma.floorPlan.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends FloorPlanUpdateManyAndReturnArgs>(args: SelectSubset<T, FloorPlanUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one FloorPlan.
     * @param {FloorPlanUpsertArgs} args - Arguments to update or create a FloorPlan.
     * @example
     * // Update or create a FloorPlan
     * const floorPlan = await prisma.floorPlan.upsert({
     *   create: {
     *     // ... data to create a FloorPlan
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the FloorPlan we want to update
     *   }
     * })
     */
    upsert<T extends FloorPlanUpsertArgs>(args: SelectSubset<T, FloorPlanUpsertArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of FloorPlans.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanCountArgs} args - Arguments to filter FloorPlans to count.
     * @example
     * // Count the number of FloorPlans
     * const count = await prisma.floorPlan.count({
     *   where: {
     *     // ... the filter for the FloorPlans we want to count
     *   }
     * })
    **/
    count<T extends FloorPlanCountArgs>(
      args?: Subset<T, FloorPlanCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], FloorPlanCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a FloorPlan.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends FloorPlanAggregateArgs>(args: Subset<T, FloorPlanAggregateArgs>): Prisma.PrismaPromise<GetFloorPlanAggregateType<T>>

    /**
     * Group by FloorPlan.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {FloorPlanGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends FloorPlanGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: FloorPlanGroupByArgs['orderBy'] }
        : { orderBy?: FloorPlanGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, FloorPlanGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetFloorPlanGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the FloorPlan model
   */
  readonly fields: FloorPlanFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for FloorPlan.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__FloorPlanClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    venue<T extends VenueDefaultArgs<ExtArgs> = {}>(args?: Subset<T, VenueDefaultArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    tables<T extends FloorPlan$tablesArgs<ExtArgs> = {}>(args?: Subset<T, FloorPlan$tablesArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the FloorPlan model
   */
  interface FloorPlanFieldRefs {
    readonly id: FieldRef<"FloorPlan", 'String'>
    readonly venueId: FieldRef<"FloorPlan", 'String'>
    readonly name: FieldRef<"FloorPlan", 'String'>
    readonly isActive: FieldRef<"FloorPlan", 'Boolean'>
    readonly layoutJson: FieldRef<"FloorPlan", 'Json'>
    readonly createdAt: FieldRef<"FloorPlan", 'DateTime'>
    readonly updatedAt: FieldRef<"FloorPlan", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * FloorPlan findUnique
   */
  export type FloorPlanFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * Filter, which FloorPlan to fetch.
     */
    where: FloorPlanWhereUniqueInput
  }

  /**
   * FloorPlan findUniqueOrThrow
   */
  export type FloorPlanFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * Filter, which FloorPlan to fetch.
     */
    where: FloorPlanWhereUniqueInput
  }

  /**
   * FloorPlan findFirst
   */
  export type FloorPlanFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * Filter, which FloorPlan to fetch.
     */
    where?: FloorPlanWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of FloorPlans to fetch.
     */
    orderBy?: FloorPlanOrderByWithRelationInput | FloorPlanOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for FloorPlans.
     */
    cursor?: FloorPlanWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` FloorPlans from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` FloorPlans.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of FloorPlans.
     */
    distinct?: FloorPlanScalarFieldEnum | FloorPlanScalarFieldEnum[]
  }

  /**
   * FloorPlan findFirstOrThrow
   */
  export type FloorPlanFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * Filter, which FloorPlan to fetch.
     */
    where?: FloorPlanWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of FloorPlans to fetch.
     */
    orderBy?: FloorPlanOrderByWithRelationInput | FloorPlanOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for FloorPlans.
     */
    cursor?: FloorPlanWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` FloorPlans from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` FloorPlans.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of FloorPlans.
     */
    distinct?: FloorPlanScalarFieldEnum | FloorPlanScalarFieldEnum[]
  }

  /**
   * FloorPlan findMany
   */
  export type FloorPlanFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * Filter, which FloorPlans to fetch.
     */
    where?: FloorPlanWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of FloorPlans to fetch.
     */
    orderBy?: FloorPlanOrderByWithRelationInput | FloorPlanOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing FloorPlans.
     */
    cursor?: FloorPlanWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` FloorPlans from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` FloorPlans.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of FloorPlans.
     */
    distinct?: FloorPlanScalarFieldEnum | FloorPlanScalarFieldEnum[]
  }

  /**
   * FloorPlan create
   */
  export type FloorPlanCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * The data needed to create a FloorPlan.
     */
    data: XOR<FloorPlanCreateInput, FloorPlanUncheckedCreateInput>
  }

  /**
   * FloorPlan createMany
   */
  export type FloorPlanCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many FloorPlans.
     */
    data: FloorPlanCreateManyInput | FloorPlanCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * FloorPlan createManyAndReturn
   */
  export type FloorPlanCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * The data used to create many FloorPlans.
     */
    data: FloorPlanCreateManyInput | FloorPlanCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * FloorPlan update
   */
  export type FloorPlanUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * The data needed to update a FloorPlan.
     */
    data: XOR<FloorPlanUpdateInput, FloorPlanUncheckedUpdateInput>
    /**
     * Choose, which FloorPlan to update.
     */
    where: FloorPlanWhereUniqueInput
  }

  /**
   * FloorPlan updateMany
   */
  export type FloorPlanUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update FloorPlans.
     */
    data: XOR<FloorPlanUpdateManyMutationInput, FloorPlanUncheckedUpdateManyInput>
    /**
     * Filter which FloorPlans to update
     */
    where?: FloorPlanWhereInput
    /**
     * Limit how many FloorPlans to update.
     */
    limit?: number
  }

  /**
   * FloorPlan updateManyAndReturn
   */
  export type FloorPlanUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * The data used to update FloorPlans.
     */
    data: XOR<FloorPlanUpdateManyMutationInput, FloorPlanUncheckedUpdateManyInput>
    /**
     * Filter which FloorPlans to update
     */
    where?: FloorPlanWhereInput
    /**
     * Limit how many FloorPlans to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * FloorPlan upsert
   */
  export type FloorPlanUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * The filter to search for the FloorPlan to update in case it exists.
     */
    where: FloorPlanWhereUniqueInput
    /**
     * In case the FloorPlan found by the `where` argument doesn't exist, create a new FloorPlan with this data.
     */
    create: XOR<FloorPlanCreateInput, FloorPlanUncheckedCreateInput>
    /**
     * In case the FloorPlan was found with the provided `where` argument, update it with this data.
     */
    update: XOR<FloorPlanUpdateInput, FloorPlanUncheckedUpdateInput>
  }

  /**
   * FloorPlan delete
   */
  export type FloorPlanDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    /**
     * Filter which FloorPlan to delete.
     */
    where: FloorPlanWhereUniqueInput
  }

  /**
   * FloorPlan deleteMany
   */
  export type FloorPlanDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which FloorPlans to delete
     */
    where?: FloorPlanWhereInput
    /**
     * Limit how many FloorPlans to delete.
     */
    limit?: number
  }

  /**
   * FloorPlan.tables
   */
  export type FloorPlan$tablesArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    where?: TableWhereInput
    orderBy?: TableOrderByWithRelationInput | TableOrderByWithRelationInput[]
    cursor?: TableWhereUniqueInput
    take?: number
    skip?: number
    distinct?: TableScalarFieldEnum | TableScalarFieldEnum[]
  }

  /**
   * FloorPlan without action
   */
  export type FloorPlanDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
  }


  /**
   * Model Table
   */

  export type AggregateTable = {
    _count: TableCountAggregateOutputType | null
    _avg: TableAvgAggregateOutputType | null
    _sum: TableSumAggregateOutputType | null
    _min: TableMinAggregateOutputType | null
    _max: TableMaxAggregateOutputType | null
  }

  export type TableAvgAggregateOutputType = {
    capacity: number | null
    minCovers: number | null
    maxCovers: number | null
    priority: number | null
  }

  export type TableSumAggregateOutputType = {
    capacity: number | null
    minCovers: number | null
    maxCovers: number | null
    priority: number | null
  }

  export type TableMinAggregateOutputType = {
    id: string | null
    name: string | null
    tableNumber: string | null
    capacity: number | null
    minCovers: number | null
    maxCovers: number | null
    location: string | null
    isActive: boolean | null
    status: $Enums.TableStatus | null
    priority: number | null
    venueId: string | null
    floorPlanId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TableMaxAggregateOutputType = {
    id: string | null
    name: string | null
    tableNumber: string | null
    capacity: number | null
    minCovers: number | null
    maxCovers: number | null
    location: string | null
    isActive: boolean | null
    status: $Enums.TableStatus | null
    priority: number | null
    venueId: string | null
    floorPlanId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type TableCountAggregateOutputType = {
    id: number
    name: number
    tableNumber: number
    capacity: number
    minCovers: number
    maxCovers: number
    location: number
    isActive: number
    status: number
    priority: number
    venueId: number
    floorPlanId: number
    shapeMetadata: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type TableAvgAggregateInputType = {
    capacity?: true
    minCovers?: true
    maxCovers?: true
    priority?: true
  }

  export type TableSumAggregateInputType = {
    capacity?: true
    minCovers?: true
    maxCovers?: true
    priority?: true
  }

  export type TableMinAggregateInputType = {
    id?: true
    name?: true
    tableNumber?: true
    capacity?: true
    minCovers?: true
    maxCovers?: true
    location?: true
    isActive?: true
    status?: true
    priority?: true
    venueId?: true
    floorPlanId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TableMaxAggregateInputType = {
    id?: true
    name?: true
    tableNumber?: true
    capacity?: true
    minCovers?: true
    maxCovers?: true
    location?: true
    isActive?: true
    status?: true
    priority?: true
    venueId?: true
    floorPlanId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type TableCountAggregateInputType = {
    id?: true
    name?: true
    tableNumber?: true
    capacity?: true
    minCovers?: true
    maxCovers?: true
    location?: true
    isActive?: true
    status?: true
    priority?: true
    venueId?: true
    floorPlanId?: true
    shapeMetadata?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type TableAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Table to aggregate.
     */
    where?: TableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tables to fetch.
     */
    orderBy?: TableOrderByWithRelationInput | TableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: TableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Tables
    **/
    _count?: true | TableCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: TableAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: TableSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: TableMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: TableMaxAggregateInputType
  }

  export type GetTableAggregateType<T extends TableAggregateArgs> = {
        [P in keyof T & keyof AggregateTable]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateTable[P]>
      : GetScalarType<T[P], AggregateTable[P]>
  }




  export type TableGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: TableWhereInput
    orderBy?: TableOrderByWithAggregationInput | TableOrderByWithAggregationInput[]
    by: TableScalarFieldEnum[] | TableScalarFieldEnum
    having?: TableScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: TableCountAggregateInputType | true
    _avg?: TableAvgAggregateInputType
    _sum?: TableSumAggregateInputType
    _min?: TableMinAggregateInputType
    _max?: TableMaxAggregateInputType
  }

  export type TableGroupByOutputType = {
    id: string
    name: string
    tableNumber: string | null
    capacity: number
    minCovers: number
    maxCovers: number | null
    location: string | null
    isActive: boolean
    status: $Enums.TableStatus
    priority: number
    venueId: string | null
    floorPlanId: string | null
    shapeMetadata: JsonValue | null
    createdAt: Date
    updatedAt: Date
    _count: TableCountAggregateOutputType | null
    _avg: TableAvgAggregateOutputType | null
    _sum: TableSumAggregateOutputType | null
    _min: TableMinAggregateOutputType | null
    _max: TableMaxAggregateOutputType | null
  }

  type GetTableGroupByPayload<T extends TableGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<TableGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof TableGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], TableGroupByOutputType[P]>
            : GetScalarType<T[P], TableGroupByOutputType[P]>
        }
      >
    >


  export type TableSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    tableNumber?: boolean
    capacity?: boolean
    minCovers?: boolean
    maxCovers?: boolean
    location?: boolean
    isActive?: boolean
    status?: boolean
    priority?: boolean
    venueId?: boolean
    floorPlanId?: boolean
    shapeMetadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | Table$venueArgs<ExtArgs>
    floorPlan?: boolean | Table$floorPlanArgs<ExtArgs>
    reservations?: boolean | Table$reservationsArgs<ExtArgs>
    holds?: boolean | Table$holdsArgs<ExtArgs>
    _count?: boolean | TableCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["table"]>

  export type TableSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    tableNumber?: boolean
    capacity?: boolean
    minCovers?: boolean
    maxCovers?: boolean
    location?: boolean
    isActive?: boolean
    status?: boolean
    priority?: boolean
    venueId?: boolean
    floorPlanId?: boolean
    shapeMetadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | Table$venueArgs<ExtArgs>
    floorPlan?: boolean | Table$floorPlanArgs<ExtArgs>
  }, ExtArgs["result"]["table"]>

  export type TableSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    name?: boolean
    tableNumber?: boolean
    capacity?: boolean
    minCovers?: boolean
    maxCovers?: boolean
    location?: boolean
    isActive?: boolean
    status?: boolean
    priority?: boolean
    venueId?: boolean
    floorPlanId?: boolean
    shapeMetadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | Table$venueArgs<ExtArgs>
    floorPlan?: boolean | Table$floorPlanArgs<ExtArgs>
  }, ExtArgs["result"]["table"]>

  export type TableSelectScalar = {
    id?: boolean
    name?: boolean
    tableNumber?: boolean
    capacity?: boolean
    minCovers?: boolean
    maxCovers?: boolean
    location?: boolean
    isActive?: boolean
    status?: boolean
    priority?: boolean
    venueId?: boolean
    floorPlanId?: boolean
    shapeMetadata?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type TableOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "name" | "tableNumber" | "capacity" | "minCovers" | "maxCovers" | "location" | "isActive" | "status" | "priority" | "venueId" | "floorPlanId" | "shapeMetadata" | "createdAt" | "updatedAt", ExtArgs["result"]["table"]>
  export type TableInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | Table$venueArgs<ExtArgs>
    floorPlan?: boolean | Table$floorPlanArgs<ExtArgs>
    reservations?: boolean | Table$reservationsArgs<ExtArgs>
    holds?: boolean | Table$holdsArgs<ExtArgs>
    _count?: boolean | TableCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type TableIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | Table$venueArgs<ExtArgs>
    floorPlan?: boolean | Table$floorPlanArgs<ExtArgs>
  }
  export type TableIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | Table$venueArgs<ExtArgs>
    floorPlan?: boolean | Table$floorPlanArgs<ExtArgs>
  }

  export type $TablePayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Table"
    objects: {
      venue: Prisma.$VenuePayload<ExtArgs> | null
      floorPlan: Prisma.$FloorPlanPayload<ExtArgs> | null
      reservations: Prisma.$ReservationPayload<ExtArgs>[]
      holds: Prisma.$ReservationHoldPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      name: string
      tableNumber: string | null
      capacity: number
      minCovers: number
      maxCovers: number | null
      location: string | null
      isActive: boolean
      status: $Enums.TableStatus
      priority: number
      venueId: string | null
      floorPlanId: string | null
      shapeMetadata: Prisma.JsonValue | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["table"]>
    composites: {}
  }

  type TableGetPayload<S extends boolean | null | undefined | TableDefaultArgs> = $Result.GetResult<Prisma.$TablePayload, S>

  type TableCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<TableFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: TableCountAggregateInputType | true
    }

  export interface TableDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Table'], meta: { name: 'Table' } }
    /**
     * Find zero or one Table that matches the filter.
     * @param {TableFindUniqueArgs} args - Arguments to find a Table
     * @example
     * // Get one Table
     * const table = await prisma.table.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends TableFindUniqueArgs>(args: SelectSubset<T, TableFindUniqueArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Table that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {TableFindUniqueOrThrowArgs} args - Arguments to find a Table
     * @example
     * // Get one Table
     * const table = await prisma.table.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends TableFindUniqueOrThrowArgs>(args: SelectSubset<T, TableFindUniqueOrThrowArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Table that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableFindFirstArgs} args - Arguments to find a Table
     * @example
     * // Get one Table
     * const table = await prisma.table.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends TableFindFirstArgs>(args?: SelectSubset<T, TableFindFirstArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Table that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableFindFirstOrThrowArgs} args - Arguments to find a Table
     * @example
     * // Get one Table
     * const table = await prisma.table.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends TableFindFirstOrThrowArgs>(args?: SelectSubset<T, TableFindFirstOrThrowArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Tables that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Tables
     * const tables = await prisma.table.findMany()
     * 
     * // Get first 10 Tables
     * const tables = await prisma.table.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const tableWithIdOnly = await prisma.table.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends TableFindManyArgs>(args?: SelectSubset<T, TableFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Table.
     * @param {TableCreateArgs} args - Arguments to create a Table.
     * @example
     * // Create one Table
     * const Table = await prisma.table.create({
     *   data: {
     *     // ... data to create a Table
     *   }
     * })
     * 
     */
    create<T extends TableCreateArgs>(args: SelectSubset<T, TableCreateArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Tables.
     * @param {TableCreateManyArgs} args - Arguments to create many Tables.
     * @example
     * // Create many Tables
     * const table = await prisma.table.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends TableCreateManyArgs>(args?: SelectSubset<T, TableCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Tables and returns the data saved in the database.
     * @param {TableCreateManyAndReturnArgs} args - Arguments to create many Tables.
     * @example
     * // Create many Tables
     * const table = await prisma.table.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Tables and only return the `id`
     * const tableWithIdOnly = await prisma.table.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends TableCreateManyAndReturnArgs>(args?: SelectSubset<T, TableCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Table.
     * @param {TableDeleteArgs} args - Arguments to delete one Table.
     * @example
     * // Delete one Table
     * const Table = await prisma.table.delete({
     *   where: {
     *     // ... filter to delete one Table
     *   }
     * })
     * 
     */
    delete<T extends TableDeleteArgs>(args: SelectSubset<T, TableDeleteArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Table.
     * @param {TableUpdateArgs} args - Arguments to update one Table.
     * @example
     * // Update one Table
     * const table = await prisma.table.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends TableUpdateArgs>(args: SelectSubset<T, TableUpdateArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Tables.
     * @param {TableDeleteManyArgs} args - Arguments to filter Tables to delete.
     * @example
     * // Delete a few Tables
     * const { count } = await prisma.table.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends TableDeleteManyArgs>(args?: SelectSubset<T, TableDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Tables
     * const table = await prisma.table.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends TableUpdateManyArgs>(args: SelectSubset<T, TableUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Tables and returns the data updated in the database.
     * @param {TableUpdateManyAndReturnArgs} args - Arguments to update many Tables.
     * @example
     * // Update many Tables
     * const table = await prisma.table.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Tables and only return the `id`
     * const tableWithIdOnly = await prisma.table.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends TableUpdateManyAndReturnArgs>(args: SelectSubset<T, TableUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Table.
     * @param {TableUpsertArgs} args - Arguments to update or create a Table.
     * @example
     * // Update or create a Table
     * const table = await prisma.table.upsert({
     *   create: {
     *     // ... data to create a Table
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Table we want to update
     *   }
     * })
     */
    upsert<T extends TableUpsertArgs>(args: SelectSubset<T, TableUpsertArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Tables.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableCountArgs} args - Arguments to filter Tables to count.
     * @example
     * // Count the number of Tables
     * const count = await prisma.table.count({
     *   where: {
     *     // ... the filter for the Tables we want to count
     *   }
     * })
    **/
    count<T extends TableCountArgs>(
      args?: Subset<T, TableCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], TableCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Table.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends TableAggregateArgs>(args: Subset<T, TableAggregateArgs>): Prisma.PrismaPromise<GetTableAggregateType<T>>

    /**
     * Group by Table.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {TableGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends TableGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: TableGroupByArgs['orderBy'] }
        : { orderBy?: TableGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, TableGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetTableGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Table model
   */
  readonly fields: TableFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Table.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__TableClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    venue<T extends Table$venueArgs<ExtArgs> = {}>(args?: Subset<T, Table$venueArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    floorPlan<T extends Table$floorPlanArgs<ExtArgs> = {}>(args?: Subset<T, Table$floorPlanArgs<ExtArgs>>): Prisma__FloorPlanClient<$Result.GetResult<Prisma.$FloorPlanPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    reservations<T extends Table$reservationsArgs<ExtArgs> = {}>(args?: Subset<T, Table$reservationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    holds<T extends Table$holdsArgs<ExtArgs> = {}>(args?: Subset<T, Table$holdsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Table model
   */
  interface TableFieldRefs {
    readonly id: FieldRef<"Table", 'String'>
    readonly name: FieldRef<"Table", 'String'>
    readonly tableNumber: FieldRef<"Table", 'String'>
    readonly capacity: FieldRef<"Table", 'Int'>
    readonly minCovers: FieldRef<"Table", 'Int'>
    readonly maxCovers: FieldRef<"Table", 'Int'>
    readonly location: FieldRef<"Table", 'String'>
    readonly isActive: FieldRef<"Table", 'Boolean'>
    readonly status: FieldRef<"Table", 'TableStatus'>
    readonly priority: FieldRef<"Table", 'Int'>
    readonly venueId: FieldRef<"Table", 'String'>
    readonly floorPlanId: FieldRef<"Table", 'String'>
    readonly shapeMetadata: FieldRef<"Table", 'Json'>
    readonly createdAt: FieldRef<"Table", 'DateTime'>
    readonly updatedAt: FieldRef<"Table", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Table findUnique
   */
  export type TableFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * Filter, which Table to fetch.
     */
    where: TableWhereUniqueInput
  }

  /**
   * Table findUniqueOrThrow
   */
  export type TableFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * Filter, which Table to fetch.
     */
    where: TableWhereUniqueInput
  }

  /**
   * Table findFirst
   */
  export type TableFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * Filter, which Table to fetch.
     */
    where?: TableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tables to fetch.
     */
    orderBy?: TableOrderByWithRelationInput | TableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tables.
     */
    cursor?: TableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tables.
     */
    distinct?: TableScalarFieldEnum | TableScalarFieldEnum[]
  }

  /**
   * Table findFirstOrThrow
   */
  export type TableFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * Filter, which Table to fetch.
     */
    where?: TableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tables to fetch.
     */
    orderBy?: TableOrderByWithRelationInput | TableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Tables.
     */
    cursor?: TableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tables.
     */
    distinct?: TableScalarFieldEnum | TableScalarFieldEnum[]
  }

  /**
   * Table findMany
   */
  export type TableFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * Filter, which Tables to fetch.
     */
    where?: TableWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Tables to fetch.
     */
    orderBy?: TableOrderByWithRelationInput | TableOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Tables.
     */
    cursor?: TableWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Tables from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Tables.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Tables.
     */
    distinct?: TableScalarFieldEnum | TableScalarFieldEnum[]
  }

  /**
   * Table create
   */
  export type TableCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * The data needed to create a Table.
     */
    data: XOR<TableCreateInput, TableUncheckedCreateInput>
  }

  /**
   * Table createMany
   */
  export type TableCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Tables.
     */
    data: TableCreateManyInput | TableCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Table createManyAndReturn
   */
  export type TableCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * The data used to create many Tables.
     */
    data: TableCreateManyInput | TableCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Table update
   */
  export type TableUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * The data needed to update a Table.
     */
    data: XOR<TableUpdateInput, TableUncheckedUpdateInput>
    /**
     * Choose, which Table to update.
     */
    where: TableWhereUniqueInput
  }

  /**
   * Table updateMany
   */
  export type TableUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Tables.
     */
    data: XOR<TableUpdateManyMutationInput, TableUncheckedUpdateManyInput>
    /**
     * Filter which Tables to update
     */
    where?: TableWhereInput
    /**
     * Limit how many Tables to update.
     */
    limit?: number
  }

  /**
   * Table updateManyAndReturn
   */
  export type TableUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * The data used to update Tables.
     */
    data: XOR<TableUpdateManyMutationInput, TableUncheckedUpdateManyInput>
    /**
     * Filter which Tables to update
     */
    where?: TableWhereInput
    /**
     * Limit how many Tables to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Table upsert
   */
  export type TableUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * The filter to search for the Table to update in case it exists.
     */
    where: TableWhereUniqueInput
    /**
     * In case the Table found by the `where` argument doesn't exist, create a new Table with this data.
     */
    create: XOR<TableCreateInput, TableUncheckedCreateInput>
    /**
     * In case the Table was found with the provided `where` argument, update it with this data.
     */
    update: XOR<TableUpdateInput, TableUncheckedUpdateInput>
  }

  /**
   * Table delete
   */
  export type TableDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
    /**
     * Filter which Table to delete.
     */
    where: TableWhereUniqueInput
  }

  /**
   * Table deleteMany
   */
  export type TableDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Tables to delete
     */
    where?: TableWhereInput
    /**
     * Limit how many Tables to delete.
     */
    limit?: number
  }

  /**
   * Table.venue
   */
  export type Table$venueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    where?: VenueWhereInput
  }

  /**
   * Table.floorPlan
   */
  export type Table$floorPlanArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the FloorPlan
     */
    select?: FloorPlanSelect<ExtArgs> | null
    /**
     * Omit specific fields from the FloorPlan
     */
    omit?: FloorPlanOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: FloorPlanInclude<ExtArgs> | null
    where?: FloorPlanWhereInput
  }

  /**
   * Table.reservations
   */
  export type Table$reservationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    where?: ReservationWhereInput
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    cursor?: ReservationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ReservationScalarFieldEnum | ReservationScalarFieldEnum[]
  }

  /**
   * Table.holds
   */
  export type Table$holdsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    where?: ReservationHoldWhereInput
    orderBy?: ReservationHoldOrderByWithRelationInput | ReservationHoldOrderByWithRelationInput[]
    cursor?: ReservationHoldWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ReservationHoldScalarFieldEnum | ReservationHoldScalarFieldEnum[]
  }

  /**
   * Table without action
   */
  export type TableDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Table
     */
    select?: TableSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Table
     */
    omit?: TableOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: TableInclude<ExtArgs> | null
  }


  /**
   * Model Guest
   */

  export type AggregateGuest = {
    _count: GuestCountAggregateOutputType | null
    _avg: GuestAvgAggregateOutputType | null
    _sum: GuestSumAggregateOutputType | null
    _min: GuestMinAggregateOutputType | null
    _max: GuestMaxAggregateOutputType | null
  }

  export type GuestAvgAggregateOutputType = {
    visitCount: number | null
    lifetimeSpend: Decimal | null
  }

  export type GuestSumAggregateOutputType = {
    visitCount: number | null
    lifetimeSpend: Decimal | null
  }

  export type GuestMinAggregateOutputType = {
    id: string | null
    venueId: string | null
    email: string | null
    phone: string | null
    name: string | null
    notes: string | null
    visitCount: number | null
    lifetimeSpend: Decimal | null
    lastVisit: Date | null
    communicationPreference: $Enums.CommunicationPreference | null
    stripeCustomerId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GuestMaxAggregateOutputType = {
    id: string | null
    venueId: string | null
    email: string | null
    phone: string | null
    name: string | null
    notes: string | null
    visitCount: number | null
    lifetimeSpend: Decimal | null
    lastVisit: Date | null
    communicationPreference: $Enums.CommunicationPreference | null
    stripeCustomerId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type GuestCountAggregateOutputType = {
    id: number
    venueId: number
    email: number
    phone: number
    name: number
    notes: number
    visitCount: number
    lifetimeSpend: number
    lastVisit: number
    tags: number
    dietaryRestrictions: number
    staffNotes: number
    communicationPreference: number
    stripeCustomerId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type GuestAvgAggregateInputType = {
    visitCount?: true
    lifetimeSpend?: true
  }

  export type GuestSumAggregateInputType = {
    visitCount?: true
    lifetimeSpend?: true
  }

  export type GuestMinAggregateInputType = {
    id?: true
    venueId?: true
    email?: true
    phone?: true
    name?: true
    notes?: true
    visitCount?: true
    lifetimeSpend?: true
    lastVisit?: true
    communicationPreference?: true
    stripeCustomerId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GuestMaxAggregateInputType = {
    id?: true
    venueId?: true
    email?: true
    phone?: true
    name?: true
    notes?: true
    visitCount?: true
    lifetimeSpend?: true
    lastVisit?: true
    communicationPreference?: true
    stripeCustomerId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type GuestCountAggregateInputType = {
    id?: true
    venueId?: true
    email?: true
    phone?: true
    name?: true
    notes?: true
    visitCount?: true
    lifetimeSpend?: true
    lastVisit?: true
    tags?: true
    dietaryRestrictions?: true
    staffNotes?: true
    communicationPreference?: true
    stripeCustomerId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type GuestAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Guest to aggregate.
     */
    where?: GuestWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Guests to fetch.
     */
    orderBy?: GuestOrderByWithRelationInput | GuestOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: GuestWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Guests from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Guests.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Guests
    **/
    _count?: true | GuestCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: GuestAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: GuestSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: GuestMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: GuestMaxAggregateInputType
  }

  export type GetGuestAggregateType<T extends GuestAggregateArgs> = {
        [P in keyof T & keyof AggregateGuest]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateGuest[P]>
      : GetScalarType<T[P], AggregateGuest[P]>
  }




  export type GuestGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: GuestWhereInput
    orderBy?: GuestOrderByWithAggregationInput | GuestOrderByWithAggregationInput[]
    by: GuestScalarFieldEnum[] | GuestScalarFieldEnum
    having?: GuestScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: GuestCountAggregateInputType | true
    _avg?: GuestAvgAggregateInputType
    _sum?: GuestSumAggregateInputType
    _min?: GuestMinAggregateInputType
    _max?: GuestMaxAggregateInputType
  }

  export type GuestGroupByOutputType = {
    id: string
    venueId: string
    email: string | null
    phone: string | null
    name: string
    notes: string | null
    visitCount: number
    lifetimeSpend: Decimal | null
    lastVisit: Date | null
    tags: JsonValue | null
    dietaryRestrictions: JsonValue | null
    staffNotes: JsonValue | null
    communicationPreference: $Enums.CommunicationPreference
    stripeCustomerId: string | null
    createdAt: Date
    updatedAt: Date
    _count: GuestCountAggregateOutputType | null
    _avg: GuestAvgAggregateOutputType | null
    _sum: GuestSumAggregateOutputType | null
    _min: GuestMinAggregateOutputType | null
    _max: GuestMaxAggregateOutputType | null
  }

  type GetGuestGroupByPayload<T extends GuestGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<GuestGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof GuestGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], GuestGroupByOutputType[P]>
            : GetScalarType<T[P], GuestGroupByOutputType[P]>
        }
      >
    >


  export type GuestSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    email?: boolean
    phone?: boolean
    name?: boolean
    notes?: boolean
    visitCount?: boolean
    lifetimeSpend?: boolean
    lastVisit?: boolean
    tags?: boolean
    dietaryRestrictions?: boolean
    staffNotes?: boolean
    communicationPreference?: boolean
    stripeCustomerId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    reservations?: boolean | Guest$reservationsArgs<ExtArgs>
    _count?: boolean | GuestCountOutputTypeDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["guest"]>

  export type GuestSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    email?: boolean
    phone?: boolean
    name?: boolean
    notes?: boolean
    visitCount?: boolean
    lifetimeSpend?: boolean
    lastVisit?: boolean
    tags?: boolean
    dietaryRestrictions?: boolean
    staffNotes?: boolean
    communicationPreference?: boolean
    stripeCustomerId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["guest"]>

  export type GuestSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    email?: boolean
    phone?: boolean
    name?: boolean
    notes?: boolean
    visitCount?: boolean
    lifetimeSpend?: boolean
    lastVisit?: boolean
    tags?: boolean
    dietaryRestrictions?: boolean
    staffNotes?: boolean
    communicationPreference?: boolean
    stripeCustomerId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["guest"]>

  export type GuestSelectScalar = {
    id?: boolean
    venueId?: boolean
    email?: boolean
    phone?: boolean
    name?: boolean
    notes?: boolean
    visitCount?: boolean
    lifetimeSpend?: boolean
    lastVisit?: boolean
    tags?: boolean
    dietaryRestrictions?: boolean
    staffNotes?: boolean
    communicationPreference?: boolean
    stripeCustomerId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type GuestOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "venueId" | "email" | "phone" | "name" | "notes" | "visitCount" | "lifetimeSpend" | "lastVisit" | "tags" | "dietaryRestrictions" | "staffNotes" | "communicationPreference" | "stripeCustomerId" | "createdAt" | "updatedAt", ExtArgs["result"]["guest"]>
  export type GuestInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    reservations?: boolean | Guest$reservationsArgs<ExtArgs>
    _count?: boolean | GuestCountOutputTypeDefaultArgs<ExtArgs>
  }
  export type GuestIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }
  export type GuestIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
  }

  export type $GuestPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Guest"
    objects: {
      venue: Prisma.$VenuePayload<ExtArgs>
      reservations: Prisma.$ReservationPayload<ExtArgs>[]
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      venueId: string
      email: string | null
      phone: string | null
      name: string
      notes: string | null
      visitCount: number
      lifetimeSpend: Prisma.Decimal | null
      lastVisit: Date | null
      tags: Prisma.JsonValue | null
      dietaryRestrictions: Prisma.JsonValue | null
      staffNotes: Prisma.JsonValue | null
      communicationPreference: $Enums.CommunicationPreference
      stripeCustomerId: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["guest"]>
    composites: {}
  }

  type GuestGetPayload<S extends boolean | null | undefined | GuestDefaultArgs> = $Result.GetResult<Prisma.$GuestPayload, S>

  type GuestCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<GuestFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: GuestCountAggregateInputType | true
    }

  export interface GuestDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Guest'], meta: { name: 'Guest' } }
    /**
     * Find zero or one Guest that matches the filter.
     * @param {GuestFindUniqueArgs} args - Arguments to find a Guest
     * @example
     * // Get one Guest
     * const guest = await prisma.guest.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends GuestFindUniqueArgs>(args: SelectSubset<T, GuestFindUniqueArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Guest that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {GuestFindUniqueOrThrowArgs} args - Arguments to find a Guest
     * @example
     * // Get one Guest
     * const guest = await prisma.guest.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends GuestFindUniqueOrThrowArgs>(args: SelectSubset<T, GuestFindUniqueOrThrowArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Guest that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestFindFirstArgs} args - Arguments to find a Guest
     * @example
     * // Get one Guest
     * const guest = await prisma.guest.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends GuestFindFirstArgs>(args?: SelectSubset<T, GuestFindFirstArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Guest that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestFindFirstOrThrowArgs} args - Arguments to find a Guest
     * @example
     * // Get one Guest
     * const guest = await prisma.guest.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends GuestFindFirstOrThrowArgs>(args?: SelectSubset<T, GuestFindFirstOrThrowArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Guests that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Guests
     * const guests = await prisma.guest.findMany()
     * 
     * // Get first 10 Guests
     * const guests = await prisma.guest.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const guestWithIdOnly = await prisma.guest.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends GuestFindManyArgs>(args?: SelectSubset<T, GuestFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Guest.
     * @param {GuestCreateArgs} args - Arguments to create a Guest.
     * @example
     * // Create one Guest
     * const Guest = await prisma.guest.create({
     *   data: {
     *     // ... data to create a Guest
     *   }
     * })
     * 
     */
    create<T extends GuestCreateArgs>(args: SelectSubset<T, GuestCreateArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Guests.
     * @param {GuestCreateManyArgs} args - Arguments to create many Guests.
     * @example
     * // Create many Guests
     * const guest = await prisma.guest.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends GuestCreateManyArgs>(args?: SelectSubset<T, GuestCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Guests and returns the data saved in the database.
     * @param {GuestCreateManyAndReturnArgs} args - Arguments to create many Guests.
     * @example
     * // Create many Guests
     * const guest = await prisma.guest.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Guests and only return the `id`
     * const guestWithIdOnly = await prisma.guest.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends GuestCreateManyAndReturnArgs>(args?: SelectSubset<T, GuestCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Guest.
     * @param {GuestDeleteArgs} args - Arguments to delete one Guest.
     * @example
     * // Delete one Guest
     * const Guest = await prisma.guest.delete({
     *   where: {
     *     // ... filter to delete one Guest
     *   }
     * })
     * 
     */
    delete<T extends GuestDeleteArgs>(args: SelectSubset<T, GuestDeleteArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Guest.
     * @param {GuestUpdateArgs} args - Arguments to update one Guest.
     * @example
     * // Update one Guest
     * const guest = await prisma.guest.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends GuestUpdateArgs>(args: SelectSubset<T, GuestUpdateArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Guests.
     * @param {GuestDeleteManyArgs} args - Arguments to filter Guests to delete.
     * @example
     * // Delete a few Guests
     * const { count } = await prisma.guest.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends GuestDeleteManyArgs>(args?: SelectSubset<T, GuestDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Guests.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Guests
     * const guest = await prisma.guest.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends GuestUpdateManyArgs>(args: SelectSubset<T, GuestUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Guests and returns the data updated in the database.
     * @param {GuestUpdateManyAndReturnArgs} args - Arguments to update many Guests.
     * @example
     * // Update many Guests
     * const guest = await prisma.guest.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Guests and only return the `id`
     * const guestWithIdOnly = await prisma.guest.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends GuestUpdateManyAndReturnArgs>(args: SelectSubset<T, GuestUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Guest.
     * @param {GuestUpsertArgs} args - Arguments to update or create a Guest.
     * @example
     * // Update or create a Guest
     * const guest = await prisma.guest.upsert({
     *   create: {
     *     // ... data to create a Guest
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Guest we want to update
     *   }
     * })
     */
    upsert<T extends GuestUpsertArgs>(args: SelectSubset<T, GuestUpsertArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Guests.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestCountArgs} args - Arguments to filter Guests to count.
     * @example
     * // Count the number of Guests
     * const count = await prisma.guest.count({
     *   where: {
     *     // ... the filter for the Guests we want to count
     *   }
     * })
    **/
    count<T extends GuestCountArgs>(
      args?: Subset<T, GuestCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], GuestCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Guest.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends GuestAggregateArgs>(args: Subset<T, GuestAggregateArgs>): Prisma.PrismaPromise<GetGuestAggregateType<T>>

    /**
     * Group by Guest.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {GuestGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends GuestGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: GuestGroupByArgs['orderBy'] }
        : { orderBy?: GuestGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, GuestGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetGuestGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Guest model
   */
  readonly fields: GuestFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Guest.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__GuestClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    venue<T extends VenueDefaultArgs<ExtArgs> = {}>(args?: Subset<T, VenueDefaultArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    reservations<T extends Guest$reservationsArgs<ExtArgs> = {}>(args?: Subset<T, Guest$reservationsArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Guest model
   */
  interface GuestFieldRefs {
    readonly id: FieldRef<"Guest", 'String'>
    readonly venueId: FieldRef<"Guest", 'String'>
    readonly email: FieldRef<"Guest", 'String'>
    readonly phone: FieldRef<"Guest", 'String'>
    readonly name: FieldRef<"Guest", 'String'>
    readonly notes: FieldRef<"Guest", 'String'>
    readonly visitCount: FieldRef<"Guest", 'Int'>
    readonly lifetimeSpend: FieldRef<"Guest", 'Decimal'>
    readonly lastVisit: FieldRef<"Guest", 'DateTime'>
    readonly tags: FieldRef<"Guest", 'Json'>
    readonly dietaryRestrictions: FieldRef<"Guest", 'Json'>
    readonly staffNotes: FieldRef<"Guest", 'Json'>
    readonly communicationPreference: FieldRef<"Guest", 'CommunicationPreference'>
    readonly stripeCustomerId: FieldRef<"Guest", 'String'>
    readonly createdAt: FieldRef<"Guest", 'DateTime'>
    readonly updatedAt: FieldRef<"Guest", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Guest findUnique
   */
  export type GuestFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * Filter, which Guest to fetch.
     */
    where: GuestWhereUniqueInput
  }

  /**
   * Guest findUniqueOrThrow
   */
  export type GuestFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * Filter, which Guest to fetch.
     */
    where: GuestWhereUniqueInput
  }

  /**
   * Guest findFirst
   */
  export type GuestFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * Filter, which Guest to fetch.
     */
    where?: GuestWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Guests to fetch.
     */
    orderBy?: GuestOrderByWithRelationInput | GuestOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Guests.
     */
    cursor?: GuestWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Guests from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Guests.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Guests.
     */
    distinct?: GuestScalarFieldEnum | GuestScalarFieldEnum[]
  }

  /**
   * Guest findFirstOrThrow
   */
  export type GuestFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * Filter, which Guest to fetch.
     */
    where?: GuestWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Guests to fetch.
     */
    orderBy?: GuestOrderByWithRelationInput | GuestOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Guests.
     */
    cursor?: GuestWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Guests from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Guests.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Guests.
     */
    distinct?: GuestScalarFieldEnum | GuestScalarFieldEnum[]
  }

  /**
   * Guest findMany
   */
  export type GuestFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * Filter, which Guests to fetch.
     */
    where?: GuestWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Guests to fetch.
     */
    orderBy?: GuestOrderByWithRelationInput | GuestOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Guests.
     */
    cursor?: GuestWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Guests from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Guests.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Guests.
     */
    distinct?: GuestScalarFieldEnum | GuestScalarFieldEnum[]
  }

  /**
   * Guest create
   */
  export type GuestCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * The data needed to create a Guest.
     */
    data: XOR<GuestCreateInput, GuestUncheckedCreateInput>
  }

  /**
   * Guest createMany
   */
  export type GuestCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Guests.
     */
    data: GuestCreateManyInput | GuestCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Guest createManyAndReturn
   */
  export type GuestCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * The data used to create many Guests.
     */
    data: GuestCreateManyInput | GuestCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Guest update
   */
  export type GuestUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * The data needed to update a Guest.
     */
    data: XOR<GuestUpdateInput, GuestUncheckedUpdateInput>
    /**
     * Choose, which Guest to update.
     */
    where: GuestWhereUniqueInput
  }

  /**
   * Guest updateMany
   */
  export type GuestUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Guests.
     */
    data: XOR<GuestUpdateManyMutationInput, GuestUncheckedUpdateManyInput>
    /**
     * Filter which Guests to update
     */
    where?: GuestWhereInput
    /**
     * Limit how many Guests to update.
     */
    limit?: number
  }

  /**
   * Guest updateManyAndReturn
   */
  export type GuestUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * The data used to update Guests.
     */
    data: XOR<GuestUpdateManyMutationInput, GuestUncheckedUpdateManyInput>
    /**
     * Filter which Guests to update
     */
    where?: GuestWhereInput
    /**
     * Limit how many Guests to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Guest upsert
   */
  export type GuestUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * The filter to search for the Guest to update in case it exists.
     */
    where: GuestWhereUniqueInput
    /**
     * In case the Guest found by the `where` argument doesn't exist, create a new Guest with this data.
     */
    create: XOR<GuestCreateInput, GuestUncheckedCreateInput>
    /**
     * In case the Guest was found with the provided `where` argument, update it with this data.
     */
    update: XOR<GuestUpdateInput, GuestUncheckedUpdateInput>
  }

  /**
   * Guest delete
   */
  export type GuestDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    /**
     * Filter which Guest to delete.
     */
    where: GuestWhereUniqueInput
  }

  /**
   * Guest deleteMany
   */
  export type GuestDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Guests to delete
     */
    where?: GuestWhereInput
    /**
     * Limit how many Guests to delete.
     */
    limit?: number
  }

  /**
   * Guest.reservations
   */
  export type Guest$reservationsArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    where?: ReservationWhereInput
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    cursor?: ReservationWhereUniqueInput
    take?: number
    skip?: number
    distinct?: ReservationScalarFieldEnum | ReservationScalarFieldEnum[]
  }

  /**
   * Guest without action
   */
  export type GuestDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
  }


  /**
   * Model Reservation
   */

  export type AggregateReservation = {
    _count: ReservationCountAggregateOutputType | null
    _avg: ReservationAvgAggregateOutputType | null
    _sum: ReservationSumAggregateOutputType | null
    _min: ReservationMinAggregateOutputType | null
    _max: ReservationMaxAggregateOutputType | null
  }

  export type ReservationAvgAggregateOutputType = {
    partySize: number | null
  }

  export type ReservationSumAggregateOutputType = {
    partySize: number | null
  }

  export type ReservationMinAggregateOutputType = {
    id: string | null
    date: Date | null
    startTime: Date | null
    endTime: Date | null
    partySize: number | null
    status: $Enums.ReservationStatus | null
    notes: string | null
    cancellationReason: string | null
    cancellationNote: string | null
    occasion: $Enums.Occasion | null
    seatingPreference: $Enums.SeatingPreference | null
    guestName: string | null
    guestEmail: string | null
    guestPhone: string | null
    guestId: string | null
    userId: string | null
    tableId: string | null
    venueId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ReservationMaxAggregateOutputType = {
    id: string | null
    date: Date | null
    startTime: Date | null
    endTime: Date | null
    partySize: number | null
    status: $Enums.ReservationStatus | null
    notes: string | null
    cancellationReason: string | null
    cancellationNote: string | null
    occasion: $Enums.Occasion | null
    seatingPreference: $Enums.SeatingPreference | null
    guestName: string | null
    guestEmail: string | null
    guestPhone: string | null
    guestId: string | null
    userId: string | null
    tableId: string | null
    venueId: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type ReservationCountAggregateOutputType = {
    id: number
    date: number
    startTime: number
    endTime: number
    partySize: number
    status: number
    notes: number
    cancellationReason: number
    cancellationNote: number
    occasion: number
    seatingPreference: number
    guestName: number
    guestEmail: number
    guestPhone: number
    guestId: number
    userId: number
    tableId: number
    venueId: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type ReservationAvgAggregateInputType = {
    partySize?: true
  }

  export type ReservationSumAggregateInputType = {
    partySize?: true
  }

  export type ReservationMinAggregateInputType = {
    id?: true
    date?: true
    startTime?: true
    endTime?: true
    partySize?: true
    status?: true
    notes?: true
    cancellationReason?: true
    cancellationNote?: true
    occasion?: true
    seatingPreference?: true
    guestName?: true
    guestEmail?: true
    guestPhone?: true
    guestId?: true
    userId?: true
    tableId?: true
    venueId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ReservationMaxAggregateInputType = {
    id?: true
    date?: true
    startTime?: true
    endTime?: true
    partySize?: true
    status?: true
    notes?: true
    cancellationReason?: true
    cancellationNote?: true
    occasion?: true
    seatingPreference?: true
    guestName?: true
    guestEmail?: true
    guestPhone?: true
    guestId?: true
    userId?: true
    tableId?: true
    venueId?: true
    createdAt?: true
    updatedAt?: true
  }

  export type ReservationCountAggregateInputType = {
    id?: true
    date?: true
    startTime?: true
    endTime?: true
    partySize?: true
    status?: true
    notes?: true
    cancellationReason?: true
    cancellationNote?: true
    occasion?: true
    seatingPreference?: true
    guestName?: true
    guestEmail?: true
    guestPhone?: true
    guestId?: true
    userId?: true
    tableId?: true
    venueId?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type ReservationAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Reservation to aggregate.
     */
    where?: ReservationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Reservations to fetch.
     */
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ReservationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Reservations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Reservations
    **/
    _count?: true | ReservationCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ReservationAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ReservationSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ReservationMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ReservationMaxAggregateInputType
  }

  export type GetReservationAggregateType<T extends ReservationAggregateArgs> = {
        [P in keyof T & keyof AggregateReservation]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateReservation[P]>
      : GetScalarType<T[P], AggregateReservation[P]>
  }




  export type ReservationGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationWhereInput
    orderBy?: ReservationOrderByWithAggregationInput | ReservationOrderByWithAggregationInput[]
    by: ReservationScalarFieldEnum[] | ReservationScalarFieldEnum
    having?: ReservationScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ReservationCountAggregateInputType | true
    _avg?: ReservationAvgAggregateInputType
    _sum?: ReservationSumAggregateInputType
    _min?: ReservationMinAggregateInputType
    _max?: ReservationMaxAggregateInputType
  }

  export type ReservationGroupByOutputType = {
    id: string
    date: Date
    startTime: Date
    endTime: Date
    partySize: number
    status: $Enums.ReservationStatus
    notes: string | null
    cancellationReason: string | null
    cancellationNote: string | null
    occasion: $Enums.Occasion | null
    seatingPreference: $Enums.SeatingPreference | null
    guestName: string | null
    guestEmail: string | null
    guestPhone: string | null
    guestId: string | null
    userId: string | null
    tableId: string
    venueId: string | null
    createdAt: Date
    updatedAt: Date
    _count: ReservationCountAggregateOutputType | null
    _avg: ReservationAvgAggregateOutputType | null
    _sum: ReservationSumAggregateOutputType | null
    _min: ReservationMinAggregateOutputType | null
    _max: ReservationMaxAggregateOutputType | null
  }

  type GetReservationGroupByPayload<T extends ReservationGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ReservationGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ReservationGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ReservationGroupByOutputType[P]>
            : GetScalarType<T[P], ReservationGroupByOutputType[P]>
        }
      >
    >


  export type ReservationSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    status?: boolean
    notes?: boolean
    cancellationReason?: boolean
    cancellationNote?: boolean
    occasion?: boolean
    seatingPreference?: boolean
    guestName?: boolean
    guestEmail?: boolean
    guestPhone?: boolean
    guestId?: boolean
    userId?: boolean
    tableId?: boolean
    venueId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    guest?: boolean | Reservation$guestArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
    venue?: boolean | Reservation$venueArgs<ExtArgs>
    deposit?: boolean | Reservation$depositArgs<ExtArgs>
  }, ExtArgs["result"]["reservation"]>

  export type ReservationSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    status?: boolean
    notes?: boolean
    cancellationReason?: boolean
    cancellationNote?: boolean
    occasion?: boolean
    seatingPreference?: boolean
    guestName?: boolean
    guestEmail?: boolean
    guestPhone?: boolean
    guestId?: boolean
    userId?: boolean
    tableId?: boolean
    venueId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    guest?: boolean | Reservation$guestArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
    venue?: boolean | Reservation$venueArgs<ExtArgs>
  }, ExtArgs["result"]["reservation"]>

  export type ReservationSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    status?: boolean
    notes?: boolean
    cancellationReason?: boolean
    cancellationNote?: boolean
    occasion?: boolean
    seatingPreference?: boolean
    guestName?: boolean
    guestEmail?: boolean
    guestPhone?: boolean
    guestId?: boolean
    userId?: boolean
    tableId?: boolean
    venueId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    guest?: boolean | Reservation$guestArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
    venue?: boolean | Reservation$venueArgs<ExtArgs>
  }, ExtArgs["result"]["reservation"]>

  export type ReservationSelectScalar = {
    id?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    status?: boolean
    notes?: boolean
    cancellationReason?: boolean
    cancellationNote?: boolean
    occasion?: boolean
    seatingPreference?: boolean
    guestName?: boolean
    guestEmail?: boolean
    guestPhone?: boolean
    guestId?: boolean
    userId?: boolean
    tableId?: boolean
    venueId?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type ReservationOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "date" | "startTime" | "endTime" | "partySize" | "status" | "notes" | "cancellationReason" | "cancellationNote" | "occasion" | "seatingPreference" | "guestName" | "guestEmail" | "guestPhone" | "guestId" | "userId" | "tableId" | "venueId" | "createdAt" | "updatedAt", ExtArgs["result"]["reservation"]>
  export type ReservationInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    guest?: boolean | Reservation$guestArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
    venue?: boolean | Reservation$venueArgs<ExtArgs>
    deposit?: boolean | Reservation$depositArgs<ExtArgs>
  }
  export type ReservationIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    guest?: boolean | Reservation$guestArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
    venue?: boolean | Reservation$venueArgs<ExtArgs>
  }
  export type ReservationIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    guest?: boolean | Reservation$guestArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
    venue?: boolean | Reservation$venueArgs<ExtArgs>
  }

  export type $ReservationPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Reservation"
    objects: {
      guest: Prisma.$GuestPayload<ExtArgs> | null
      table: Prisma.$TablePayload<ExtArgs>
      venue: Prisma.$VenuePayload<ExtArgs> | null
      deposit: Prisma.$DepositPayload<ExtArgs> | null
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      date: Date
      startTime: Date
      endTime: Date
      partySize: number
      status: $Enums.ReservationStatus
      notes: string | null
      cancellationReason: string | null
      cancellationNote: string | null
      occasion: $Enums.Occasion | null
      seatingPreference: $Enums.SeatingPreference | null
      guestName: string | null
      guestEmail: string | null
      guestPhone: string | null
      guestId: string | null
      userId: string | null
      tableId: string
      venueId: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["reservation"]>
    composites: {}
  }

  type ReservationGetPayload<S extends boolean | null | undefined | ReservationDefaultArgs> = $Result.GetResult<Prisma.$ReservationPayload, S>

  type ReservationCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ReservationFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ReservationCountAggregateInputType | true
    }

  export interface ReservationDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Reservation'], meta: { name: 'Reservation' } }
    /**
     * Find zero or one Reservation that matches the filter.
     * @param {ReservationFindUniqueArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ReservationFindUniqueArgs>(args: SelectSubset<T, ReservationFindUniqueArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Reservation that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ReservationFindUniqueOrThrowArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ReservationFindUniqueOrThrowArgs>(args: SelectSubset<T, ReservationFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Reservation that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationFindFirstArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ReservationFindFirstArgs>(args?: SelectSubset<T, ReservationFindFirstArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Reservation that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationFindFirstOrThrowArgs} args - Arguments to find a Reservation
     * @example
     * // Get one Reservation
     * const reservation = await prisma.reservation.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ReservationFindFirstOrThrowArgs>(args?: SelectSubset<T, ReservationFindFirstOrThrowArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Reservations that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Reservations
     * const reservations = await prisma.reservation.findMany()
     * 
     * // Get first 10 Reservations
     * const reservations = await prisma.reservation.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const reservationWithIdOnly = await prisma.reservation.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ReservationFindManyArgs>(args?: SelectSubset<T, ReservationFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Reservation.
     * @param {ReservationCreateArgs} args - Arguments to create a Reservation.
     * @example
     * // Create one Reservation
     * const Reservation = await prisma.reservation.create({
     *   data: {
     *     // ... data to create a Reservation
     *   }
     * })
     * 
     */
    create<T extends ReservationCreateArgs>(args: SelectSubset<T, ReservationCreateArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Reservations.
     * @param {ReservationCreateManyArgs} args - Arguments to create many Reservations.
     * @example
     * // Create many Reservations
     * const reservation = await prisma.reservation.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ReservationCreateManyArgs>(args?: SelectSubset<T, ReservationCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Reservations and returns the data saved in the database.
     * @param {ReservationCreateManyAndReturnArgs} args - Arguments to create many Reservations.
     * @example
     * // Create many Reservations
     * const reservation = await prisma.reservation.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Reservations and only return the `id`
     * const reservationWithIdOnly = await prisma.reservation.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ReservationCreateManyAndReturnArgs>(args?: SelectSubset<T, ReservationCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Reservation.
     * @param {ReservationDeleteArgs} args - Arguments to delete one Reservation.
     * @example
     * // Delete one Reservation
     * const Reservation = await prisma.reservation.delete({
     *   where: {
     *     // ... filter to delete one Reservation
     *   }
     * })
     * 
     */
    delete<T extends ReservationDeleteArgs>(args: SelectSubset<T, ReservationDeleteArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Reservation.
     * @param {ReservationUpdateArgs} args - Arguments to update one Reservation.
     * @example
     * // Update one Reservation
     * const reservation = await prisma.reservation.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ReservationUpdateArgs>(args: SelectSubset<T, ReservationUpdateArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Reservations.
     * @param {ReservationDeleteManyArgs} args - Arguments to filter Reservations to delete.
     * @example
     * // Delete a few Reservations
     * const { count } = await prisma.reservation.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ReservationDeleteManyArgs>(args?: SelectSubset<T, ReservationDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Reservations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Reservations
     * const reservation = await prisma.reservation.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ReservationUpdateManyArgs>(args: SelectSubset<T, ReservationUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Reservations and returns the data updated in the database.
     * @param {ReservationUpdateManyAndReturnArgs} args - Arguments to update many Reservations.
     * @example
     * // Update many Reservations
     * const reservation = await prisma.reservation.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Reservations and only return the `id`
     * const reservationWithIdOnly = await prisma.reservation.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ReservationUpdateManyAndReturnArgs>(args: SelectSubset<T, ReservationUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Reservation.
     * @param {ReservationUpsertArgs} args - Arguments to update or create a Reservation.
     * @example
     * // Update or create a Reservation
     * const reservation = await prisma.reservation.upsert({
     *   create: {
     *     // ... data to create a Reservation
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Reservation we want to update
     *   }
     * })
     */
    upsert<T extends ReservationUpsertArgs>(args: SelectSubset<T, ReservationUpsertArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Reservations.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationCountArgs} args - Arguments to filter Reservations to count.
     * @example
     * // Count the number of Reservations
     * const count = await prisma.reservation.count({
     *   where: {
     *     // ... the filter for the Reservations we want to count
     *   }
     * })
    **/
    count<T extends ReservationCountArgs>(
      args?: Subset<T, ReservationCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ReservationCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Reservation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ReservationAggregateArgs>(args: Subset<T, ReservationAggregateArgs>): Prisma.PrismaPromise<GetReservationAggregateType<T>>

    /**
     * Group by Reservation.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ReservationGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ReservationGroupByArgs['orderBy'] }
        : { orderBy?: ReservationGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ReservationGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetReservationGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Reservation model
   */
  readonly fields: ReservationFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Reservation.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ReservationClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    guest<T extends Reservation$guestArgs<ExtArgs> = {}>(args?: Subset<T, Reservation$guestArgs<ExtArgs>>): Prisma__GuestClient<$Result.GetResult<Prisma.$GuestPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    table<T extends TableDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TableDefaultArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    venue<T extends Reservation$venueArgs<ExtArgs> = {}>(args?: Subset<T, Reservation$venueArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    deposit<T extends Reservation$depositArgs<ExtArgs> = {}>(args?: Subset<T, Reservation$depositArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Reservation model
   */
  interface ReservationFieldRefs {
    readonly id: FieldRef<"Reservation", 'String'>
    readonly date: FieldRef<"Reservation", 'DateTime'>
    readonly startTime: FieldRef<"Reservation", 'DateTime'>
    readonly endTime: FieldRef<"Reservation", 'DateTime'>
    readonly partySize: FieldRef<"Reservation", 'Int'>
    readonly status: FieldRef<"Reservation", 'ReservationStatus'>
    readonly notes: FieldRef<"Reservation", 'String'>
    readonly cancellationReason: FieldRef<"Reservation", 'String'>
    readonly cancellationNote: FieldRef<"Reservation", 'String'>
    readonly occasion: FieldRef<"Reservation", 'Occasion'>
    readonly seatingPreference: FieldRef<"Reservation", 'SeatingPreference'>
    readonly guestName: FieldRef<"Reservation", 'String'>
    readonly guestEmail: FieldRef<"Reservation", 'String'>
    readonly guestPhone: FieldRef<"Reservation", 'String'>
    readonly guestId: FieldRef<"Reservation", 'String'>
    readonly userId: FieldRef<"Reservation", 'String'>
    readonly tableId: FieldRef<"Reservation", 'String'>
    readonly venueId: FieldRef<"Reservation", 'String'>
    readonly createdAt: FieldRef<"Reservation", 'DateTime'>
    readonly updatedAt: FieldRef<"Reservation", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Reservation findUnique
   */
  export type ReservationFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * Filter, which Reservation to fetch.
     */
    where: ReservationWhereUniqueInput
  }

  /**
   * Reservation findUniqueOrThrow
   */
  export type ReservationFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * Filter, which Reservation to fetch.
     */
    where: ReservationWhereUniqueInput
  }

  /**
   * Reservation findFirst
   */
  export type ReservationFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * Filter, which Reservation to fetch.
     */
    where?: ReservationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Reservations to fetch.
     */
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Reservations.
     */
    cursor?: ReservationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Reservations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Reservations.
     */
    distinct?: ReservationScalarFieldEnum | ReservationScalarFieldEnum[]
  }

  /**
   * Reservation findFirstOrThrow
   */
  export type ReservationFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * Filter, which Reservation to fetch.
     */
    where?: ReservationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Reservations to fetch.
     */
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Reservations.
     */
    cursor?: ReservationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Reservations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Reservations.
     */
    distinct?: ReservationScalarFieldEnum | ReservationScalarFieldEnum[]
  }

  /**
   * Reservation findMany
   */
  export type ReservationFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * Filter, which Reservations to fetch.
     */
    where?: ReservationWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Reservations to fetch.
     */
    orderBy?: ReservationOrderByWithRelationInput | ReservationOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Reservations.
     */
    cursor?: ReservationWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Reservations from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Reservations.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Reservations.
     */
    distinct?: ReservationScalarFieldEnum | ReservationScalarFieldEnum[]
  }

  /**
   * Reservation create
   */
  export type ReservationCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * The data needed to create a Reservation.
     */
    data: XOR<ReservationCreateInput, ReservationUncheckedCreateInput>
  }

  /**
   * Reservation createMany
   */
  export type ReservationCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Reservations.
     */
    data: ReservationCreateManyInput | ReservationCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Reservation createManyAndReturn
   */
  export type ReservationCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * The data used to create many Reservations.
     */
    data: ReservationCreateManyInput | ReservationCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Reservation update
   */
  export type ReservationUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * The data needed to update a Reservation.
     */
    data: XOR<ReservationUpdateInput, ReservationUncheckedUpdateInput>
    /**
     * Choose, which Reservation to update.
     */
    where: ReservationWhereUniqueInput
  }

  /**
   * Reservation updateMany
   */
  export type ReservationUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Reservations.
     */
    data: XOR<ReservationUpdateManyMutationInput, ReservationUncheckedUpdateManyInput>
    /**
     * Filter which Reservations to update
     */
    where?: ReservationWhereInput
    /**
     * Limit how many Reservations to update.
     */
    limit?: number
  }

  /**
   * Reservation updateManyAndReturn
   */
  export type ReservationUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * The data used to update Reservations.
     */
    data: XOR<ReservationUpdateManyMutationInput, ReservationUncheckedUpdateManyInput>
    /**
     * Filter which Reservations to update
     */
    where?: ReservationWhereInput
    /**
     * Limit how many Reservations to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Reservation upsert
   */
  export type ReservationUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * The filter to search for the Reservation to update in case it exists.
     */
    where: ReservationWhereUniqueInput
    /**
     * In case the Reservation found by the `where` argument doesn't exist, create a new Reservation with this data.
     */
    create: XOR<ReservationCreateInput, ReservationUncheckedCreateInput>
    /**
     * In case the Reservation was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ReservationUpdateInput, ReservationUncheckedUpdateInput>
  }

  /**
   * Reservation delete
   */
  export type ReservationDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
    /**
     * Filter which Reservation to delete.
     */
    where: ReservationWhereUniqueInput
  }

  /**
   * Reservation deleteMany
   */
  export type ReservationDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Reservations to delete
     */
    where?: ReservationWhereInput
    /**
     * Limit how many Reservations to delete.
     */
    limit?: number
  }

  /**
   * Reservation.guest
   */
  export type Reservation$guestArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Guest
     */
    select?: GuestSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Guest
     */
    omit?: GuestOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: GuestInclude<ExtArgs> | null
    where?: GuestWhereInput
  }

  /**
   * Reservation.venue
   */
  export type Reservation$venueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Venue
     */
    select?: VenueSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Venue
     */
    omit?: VenueOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: VenueInclude<ExtArgs> | null
    where?: VenueWhereInput
  }

  /**
   * Reservation.deposit
   */
  export type Reservation$depositArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    where?: DepositWhereInput
  }

  /**
   * Reservation without action
   */
  export type ReservationDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Reservation
     */
    select?: ReservationSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Reservation
     */
    omit?: ReservationOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationInclude<ExtArgs> | null
  }


  /**
   * Model Deposit
   */

  export type AggregateDeposit = {
    _count: DepositCountAggregateOutputType | null
    _avg: DepositAvgAggregateOutputType | null
    _sum: DepositSumAggregateOutputType | null
    _min: DepositMinAggregateOutputType | null
    _max: DepositMaxAggregateOutputType | null
  }

  export type DepositAvgAggregateOutputType = {
    amountCents: number | null
  }

  export type DepositSumAggregateOutputType = {
    amountCents: number | null
  }

  export type DepositMinAggregateOutputType = {
    id: string | null
    reservationId: string | null
    amountCents: number | null
    currency: string | null
    status: $Enums.DepositStatus | null
    stripePaymentIntentId: string | null
    stripeCustomerId: string | null
    heldAt: Date | null
    appliedAt: Date | null
    refundedAt: Date | null
    forfeitedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type DepositMaxAggregateOutputType = {
    id: string | null
    reservationId: string | null
    amountCents: number | null
    currency: string | null
    status: $Enums.DepositStatus | null
    stripePaymentIntentId: string | null
    stripeCustomerId: string | null
    heldAt: Date | null
    appliedAt: Date | null
    refundedAt: Date | null
    forfeitedAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type DepositCountAggregateOutputType = {
    id: number
    reservationId: number
    amountCents: number
    currency: number
    status: number
    stripePaymentIntentId: number
    stripeCustomerId: number
    heldAt: number
    appliedAt: number
    refundedAt: number
    forfeitedAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type DepositAvgAggregateInputType = {
    amountCents?: true
  }

  export type DepositSumAggregateInputType = {
    amountCents?: true
  }

  export type DepositMinAggregateInputType = {
    id?: true
    reservationId?: true
    amountCents?: true
    currency?: true
    status?: true
    stripePaymentIntentId?: true
    stripeCustomerId?: true
    heldAt?: true
    appliedAt?: true
    refundedAt?: true
    forfeitedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type DepositMaxAggregateInputType = {
    id?: true
    reservationId?: true
    amountCents?: true
    currency?: true
    status?: true
    stripePaymentIntentId?: true
    stripeCustomerId?: true
    heldAt?: true
    appliedAt?: true
    refundedAt?: true
    forfeitedAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type DepositCountAggregateInputType = {
    id?: true
    reservationId?: true
    amountCents?: true
    currency?: true
    status?: true
    stripePaymentIntentId?: true
    stripeCustomerId?: true
    heldAt?: true
    appliedAt?: true
    refundedAt?: true
    forfeitedAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type DepositAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Deposit to aggregate.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned Deposits
    **/
    _count?: true | DepositCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: DepositAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: DepositSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: DepositMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: DepositMaxAggregateInputType
  }

  export type GetDepositAggregateType<T extends DepositAggregateArgs> = {
        [P in keyof T & keyof AggregateDeposit]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateDeposit[P]>
      : GetScalarType<T[P], AggregateDeposit[P]>
  }




  export type DepositGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: DepositWhereInput
    orderBy?: DepositOrderByWithAggregationInput | DepositOrderByWithAggregationInput[]
    by: DepositScalarFieldEnum[] | DepositScalarFieldEnum
    having?: DepositScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: DepositCountAggregateInputType | true
    _avg?: DepositAvgAggregateInputType
    _sum?: DepositSumAggregateInputType
    _min?: DepositMinAggregateInputType
    _max?: DepositMaxAggregateInputType
  }

  export type DepositGroupByOutputType = {
    id: string
    reservationId: string
    amountCents: number
    currency: string
    status: $Enums.DepositStatus
    stripePaymentIntentId: string | null
    stripeCustomerId: string | null
    heldAt: Date | null
    appliedAt: Date | null
    refundedAt: Date | null
    forfeitedAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: DepositCountAggregateOutputType | null
    _avg: DepositAvgAggregateOutputType | null
    _sum: DepositSumAggregateOutputType | null
    _min: DepositMinAggregateOutputType | null
    _max: DepositMaxAggregateOutputType | null
  }

  type GetDepositGroupByPayload<T extends DepositGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<DepositGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof DepositGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], DepositGroupByOutputType[P]>
            : GetScalarType<T[P], DepositGroupByOutputType[P]>
        }
      >
    >


  export type DepositSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    reservationId?: boolean
    amountCents?: boolean
    currency?: boolean
    status?: boolean
    stripePaymentIntentId?: boolean
    stripeCustomerId?: boolean
    heldAt?: boolean
    appliedAt?: boolean
    refundedAt?: boolean
    forfeitedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    reservation?: boolean | ReservationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["deposit"]>

  export type DepositSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    reservationId?: boolean
    amountCents?: boolean
    currency?: boolean
    status?: boolean
    stripePaymentIntentId?: boolean
    stripeCustomerId?: boolean
    heldAt?: boolean
    appliedAt?: boolean
    refundedAt?: boolean
    forfeitedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    reservation?: boolean | ReservationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["deposit"]>

  export type DepositSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    reservationId?: boolean
    amountCents?: boolean
    currency?: boolean
    status?: boolean
    stripePaymentIntentId?: boolean
    stripeCustomerId?: boolean
    heldAt?: boolean
    appliedAt?: boolean
    refundedAt?: boolean
    forfeitedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
    reservation?: boolean | ReservationDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["deposit"]>

  export type DepositSelectScalar = {
    id?: boolean
    reservationId?: boolean
    amountCents?: boolean
    currency?: boolean
    status?: boolean
    stripePaymentIntentId?: boolean
    stripeCustomerId?: boolean
    heldAt?: boolean
    appliedAt?: boolean
    refundedAt?: boolean
    forfeitedAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type DepositOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "reservationId" | "amountCents" | "currency" | "status" | "stripePaymentIntentId" | "stripeCustomerId" | "heldAt" | "appliedAt" | "refundedAt" | "forfeitedAt" | "createdAt" | "updatedAt", ExtArgs["result"]["deposit"]>
  export type DepositInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    reservation?: boolean | ReservationDefaultArgs<ExtArgs>
  }
  export type DepositIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    reservation?: boolean | ReservationDefaultArgs<ExtArgs>
  }
  export type DepositIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    reservation?: boolean | ReservationDefaultArgs<ExtArgs>
  }

  export type $DepositPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "Deposit"
    objects: {
      reservation: Prisma.$ReservationPayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      reservationId: string
      amountCents: number
      currency: string
      status: $Enums.DepositStatus
      stripePaymentIntentId: string | null
      stripeCustomerId: string | null
      heldAt: Date | null
      appliedAt: Date | null
      refundedAt: Date | null
      forfeitedAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["deposit"]>
    composites: {}
  }

  type DepositGetPayload<S extends boolean | null | undefined | DepositDefaultArgs> = $Result.GetResult<Prisma.$DepositPayload, S>

  type DepositCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<DepositFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: DepositCountAggregateInputType | true
    }

  export interface DepositDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['Deposit'], meta: { name: 'Deposit' } }
    /**
     * Find zero or one Deposit that matches the filter.
     * @param {DepositFindUniqueArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends DepositFindUniqueArgs>(args: SelectSubset<T, DepositFindUniqueArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one Deposit that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {DepositFindUniqueOrThrowArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends DepositFindUniqueOrThrowArgs>(args: SelectSubset<T, DepositFindUniqueOrThrowArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Deposit that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositFindFirstArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends DepositFindFirstArgs>(args?: SelectSubset<T, DepositFindFirstArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first Deposit that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositFindFirstOrThrowArgs} args - Arguments to find a Deposit
     * @example
     * // Get one Deposit
     * const deposit = await prisma.deposit.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends DepositFindFirstOrThrowArgs>(args?: SelectSubset<T, DepositFindFirstOrThrowArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more Deposits that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Deposits
     * const deposits = await prisma.deposit.findMany()
     * 
     * // Get first 10 Deposits
     * const deposits = await prisma.deposit.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const depositWithIdOnly = await prisma.deposit.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends DepositFindManyArgs>(args?: SelectSubset<T, DepositFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a Deposit.
     * @param {DepositCreateArgs} args - Arguments to create a Deposit.
     * @example
     * // Create one Deposit
     * const Deposit = await prisma.deposit.create({
     *   data: {
     *     // ... data to create a Deposit
     *   }
     * })
     * 
     */
    create<T extends DepositCreateArgs>(args: SelectSubset<T, DepositCreateArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many Deposits.
     * @param {DepositCreateManyArgs} args - Arguments to create many Deposits.
     * @example
     * // Create many Deposits
     * const deposit = await prisma.deposit.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends DepositCreateManyArgs>(args?: SelectSubset<T, DepositCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many Deposits and returns the data saved in the database.
     * @param {DepositCreateManyAndReturnArgs} args - Arguments to create many Deposits.
     * @example
     * // Create many Deposits
     * const deposit = await prisma.deposit.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many Deposits and only return the `id`
     * const depositWithIdOnly = await prisma.deposit.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends DepositCreateManyAndReturnArgs>(args?: SelectSubset<T, DepositCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a Deposit.
     * @param {DepositDeleteArgs} args - Arguments to delete one Deposit.
     * @example
     * // Delete one Deposit
     * const Deposit = await prisma.deposit.delete({
     *   where: {
     *     // ... filter to delete one Deposit
     *   }
     * })
     * 
     */
    delete<T extends DepositDeleteArgs>(args: SelectSubset<T, DepositDeleteArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one Deposit.
     * @param {DepositUpdateArgs} args - Arguments to update one Deposit.
     * @example
     * // Update one Deposit
     * const deposit = await prisma.deposit.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends DepositUpdateArgs>(args: SelectSubset<T, DepositUpdateArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more Deposits.
     * @param {DepositDeleteManyArgs} args - Arguments to filter Deposits to delete.
     * @example
     * // Delete a few Deposits
     * const { count } = await prisma.deposit.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends DepositDeleteManyArgs>(args?: SelectSubset<T, DepositDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Deposits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Deposits
     * const deposit = await prisma.deposit.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends DepositUpdateManyArgs>(args: SelectSubset<T, DepositUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more Deposits and returns the data updated in the database.
     * @param {DepositUpdateManyAndReturnArgs} args - Arguments to update many Deposits.
     * @example
     * // Update many Deposits
     * const deposit = await prisma.deposit.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more Deposits and only return the `id`
     * const depositWithIdOnly = await prisma.deposit.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends DepositUpdateManyAndReturnArgs>(args: SelectSubset<T, DepositUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one Deposit.
     * @param {DepositUpsertArgs} args - Arguments to update or create a Deposit.
     * @example
     * // Update or create a Deposit
     * const deposit = await prisma.deposit.upsert({
     *   create: {
     *     // ... data to create a Deposit
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Deposit we want to update
     *   }
     * })
     */
    upsert<T extends DepositUpsertArgs>(args: SelectSubset<T, DepositUpsertArgs<ExtArgs>>): Prisma__DepositClient<$Result.GetResult<Prisma.$DepositPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of Deposits.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositCountArgs} args - Arguments to filter Deposits to count.
     * @example
     * // Count the number of Deposits
     * const count = await prisma.deposit.count({
     *   where: {
     *     // ... the filter for the Deposits we want to count
     *   }
     * })
    **/
    count<T extends DepositCountArgs>(
      args?: Subset<T, DepositCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], DepositCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a Deposit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends DepositAggregateArgs>(args: Subset<T, DepositAggregateArgs>): Prisma.PrismaPromise<GetDepositAggregateType<T>>

    /**
     * Group by Deposit.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {DepositGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends DepositGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: DepositGroupByArgs['orderBy'] }
        : { orderBy?: DepositGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, DepositGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetDepositGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the Deposit model
   */
  readonly fields: DepositFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Deposit.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__DepositClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    reservation<T extends ReservationDefaultArgs<ExtArgs> = {}>(args?: Subset<T, ReservationDefaultArgs<ExtArgs>>): Prisma__ReservationClient<$Result.GetResult<Prisma.$ReservationPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the Deposit model
   */
  interface DepositFieldRefs {
    readonly id: FieldRef<"Deposit", 'String'>
    readonly reservationId: FieldRef<"Deposit", 'String'>
    readonly amountCents: FieldRef<"Deposit", 'Int'>
    readonly currency: FieldRef<"Deposit", 'String'>
    readonly status: FieldRef<"Deposit", 'DepositStatus'>
    readonly stripePaymentIntentId: FieldRef<"Deposit", 'String'>
    readonly stripeCustomerId: FieldRef<"Deposit", 'String'>
    readonly heldAt: FieldRef<"Deposit", 'DateTime'>
    readonly appliedAt: FieldRef<"Deposit", 'DateTime'>
    readonly refundedAt: FieldRef<"Deposit", 'DateTime'>
    readonly forfeitedAt: FieldRef<"Deposit", 'DateTime'>
    readonly createdAt: FieldRef<"Deposit", 'DateTime'>
    readonly updatedAt: FieldRef<"Deposit", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * Deposit findUnique
   */
  export type DepositFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit findUniqueOrThrow
   */
  export type DepositFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit findFirst
   */
  export type DepositFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Deposits.
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Deposits.
     */
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Deposit findFirstOrThrow
   */
  export type DepositFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposit to fetch.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for Deposits.
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Deposits.
     */
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Deposit findMany
   */
  export type DepositFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter, which Deposits to fetch.
     */
    where?: DepositWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of Deposits to fetch.
     */
    orderBy?: DepositOrderByWithRelationInput | DepositOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing Deposits.
     */
    cursor?: DepositWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` Deposits from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` Deposits.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of Deposits.
     */
    distinct?: DepositScalarFieldEnum | DepositScalarFieldEnum[]
  }

  /**
   * Deposit create
   */
  export type DepositCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * The data needed to create a Deposit.
     */
    data: XOR<DepositCreateInput, DepositUncheckedCreateInput>
  }

  /**
   * Deposit createMany
   */
  export type DepositCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many Deposits.
     */
    data: DepositCreateManyInput | DepositCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * Deposit createManyAndReturn
   */
  export type DepositCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * The data used to create many Deposits.
     */
    data: DepositCreateManyInput | DepositCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * Deposit update
   */
  export type DepositUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * The data needed to update a Deposit.
     */
    data: XOR<DepositUpdateInput, DepositUncheckedUpdateInput>
    /**
     * Choose, which Deposit to update.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit updateMany
   */
  export type DepositUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update Deposits.
     */
    data: XOR<DepositUpdateManyMutationInput, DepositUncheckedUpdateManyInput>
    /**
     * Filter which Deposits to update
     */
    where?: DepositWhereInput
    /**
     * Limit how many Deposits to update.
     */
    limit?: number
  }

  /**
   * Deposit updateManyAndReturn
   */
  export type DepositUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * The data used to update Deposits.
     */
    data: XOR<DepositUpdateManyMutationInput, DepositUncheckedUpdateManyInput>
    /**
     * Filter which Deposits to update
     */
    where?: DepositWhereInput
    /**
     * Limit how many Deposits to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * Deposit upsert
   */
  export type DepositUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * The filter to search for the Deposit to update in case it exists.
     */
    where: DepositWhereUniqueInput
    /**
     * In case the Deposit found by the `where` argument doesn't exist, create a new Deposit with this data.
     */
    create: XOR<DepositCreateInput, DepositUncheckedCreateInput>
    /**
     * In case the Deposit was found with the provided `where` argument, update it with this data.
     */
    update: XOR<DepositUpdateInput, DepositUncheckedUpdateInput>
  }

  /**
   * Deposit delete
   */
  export type DepositDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
    /**
     * Filter which Deposit to delete.
     */
    where: DepositWhereUniqueInput
  }

  /**
   * Deposit deleteMany
   */
  export type DepositDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which Deposits to delete
     */
    where?: DepositWhereInput
    /**
     * Limit how many Deposits to delete.
     */
    limit?: number
  }

  /**
   * Deposit without action
   */
  export type DepositDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the Deposit
     */
    select?: DepositSelect<ExtArgs> | null
    /**
     * Omit specific fields from the Deposit
     */
    omit?: DepositOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: DepositInclude<ExtArgs> | null
  }


  /**
   * Model WaitlistEntry
   */

  export type AggregateWaitlistEntry = {
    _count: WaitlistEntryCountAggregateOutputType | null
    _avg: WaitlistEntryAvgAggregateOutputType | null
    _sum: WaitlistEntrySumAggregateOutputType | null
    _min: WaitlistEntryMinAggregateOutputType | null
    _max: WaitlistEntryMaxAggregateOutputType | null
  }

  export type WaitlistEntryAvgAggregateOutputType = {
    partySize: number | null
    position: number | null
    estimatedWaitMinutes: number | null
  }

  export type WaitlistEntrySumAggregateOutputType = {
    partySize: number | null
    position: number | null
    estimatedWaitMinutes: number | null
  }

  export type WaitlistEntryMinAggregateOutputType = {
    id: string | null
    venueId: string | null
    partySize: number | null
    guestName: string | null
    guestPhone: string | null
    position: number | null
    estimatedWaitMinutes: number | null
    status: $Enums.WaitlistStatus | null
    notifiedAt: Date | null
    expiresAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WaitlistEntryMaxAggregateOutputType = {
    id: string | null
    venueId: string | null
    partySize: number | null
    guestName: string | null
    guestPhone: string | null
    position: number | null
    estimatedWaitMinutes: number | null
    status: $Enums.WaitlistStatus | null
    notifiedAt: Date | null
    expiresAt: Date | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WaitlistEntryCountAggregateOutputType = {
    id: number
    venueId: number
    partySize: number
    guestName: number
    guestPhone: number
    position: number
    estimatedWaitMinutes: number
    status: number
    notifiedAt: number
    expiresAt: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WaitlistEntryAvgAggregateInputType = {
    partySize?: true
    position?: true
    estimatedWaitMinutes?: true
  }

  export type WaitlistEntrySumAggregateInputType = {
    partySize?: true
    position?: true
    estimatedWaitMinutes?: true
  }

  export type WaitlistEntryMinAggregateInputType = {
    id?: true
    venueId?: true
    partySize?: true
    guestName?: true
    guestPhone?: true
    position?: true
    estimatedWaitMinutes?: true
    status?: true
    notifiedAt?: true
    expiresAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WaitlistEntryMaxAggregateInputType = {
    id?: true
    venueId?: true
    partySize?: true
    guestName?: true
    guestPhone?: true
    position?: true
    estimatedWaitMinutes?: true
    status?: true
    notifiedAt?: true
    expiresAt?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WaitlistEntryCountAggregateInputType = {
    id?: true
    venueId?: true
    partySize?: true
    guestName?: true
    guestPhone?: true
    position?: true
    estimatedWaitMinutes?: true
    status?: true
    notifiedAt?: true
    expiresAt?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WaitlistEntryAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WaitlistEntry to aggregate.
     */
    where?: WaitlistEntryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WaitlistEntries to fetch.
     */
    orderBy?: WaitlistEntryOrderByWithRelationInput | WaitlistEntryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WaitlistEntryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WaitlistEntries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WaitlistEntries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WaitlistEntries
    **/
    _count?: true | WaitlistEntryCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WaitlistEntryAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WaitlistEntrySumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WaitlistEntryMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WaitlistEntryMaxAggregateInputType
  }

  export type GetWaitlistEntryAggregateType<T extends WaitlistEntryAggregateArgs> = {
        [P in keyof T & keyof AggregateWaitlistEntry]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWaitlistEntry[P]>
      : GetScalarType<T[P], AggregateWaitlistEntry[P]>
  }




  export type WaitlistEntryGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WaitlistEntryWhereInput
    orderBy?: WaitlistEntryOrderByWithAggregationInput | WaitlistEntryOrderByWithAggregationInput[]
    by: WaitlistEntryScalarFieldEnum[] | WaitlistEntryScalarFieldEnum
    having?: WaitlistEntryScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WaitlistEntryCountAggregateInputType | true
    _avg?: WaitlistEntryAvgAggregateInputType
    _sum?: WaitlistEntrySumAggregateInputType
    _min?: WaitlistEntryMinAggregateInputType
    _max?: WaitlistEntryMaxAggregateInputType
  }

  export type WaitlistEntryGroupByOutputType = {
    id: string
    venueId: string
    partySize: number
    guestName: string
    guestPhone: string
    position: number
    estimatedWaitMinutes: number
    status: $Enums.WaitlistStatus
    notifiedAt: Date | null
    expiresAt: Date | null
    createdAt: Date
    updatedAt: Date
    _count: WaitlistEntryCountAggregateOutputType | null
    _avg: WaitlistEntryAvgAggregateOutputType | null
    _sum: WaitlistEntrySumAggregateOutputType | null
    _min: WaitlistEntryMinAggregateOutputType | null
    _max: WaitlistEntryMaxAggregateOutputType | null
  }

  type GetWaitlistEntryGroupByPayload<T extends WaitlistEntryGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WaitlistEntryGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WaitlistEntryGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WaitlistEntryGroupByOutputType[P]>
            : GetScalarType<T[P], WaitlistEntryGroupByOutputType[P]>
        }
      >
    >


  export type WaitlistEntrySelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    partySize?: boolean
    guestName?: boolean
    guestPhone?: boolean
    position?: boolean
    estimatedWaitMinutes?: boolean
    status?: boolean
    notifiedAt?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["waitlistEntry"]>

  export type WaitlistEntrySelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    partySize?: boolean
    guestName?: boolean
    guestPhone?: boolean
    position?: boolean
    estimatedWaitMinutes?: boolean
    status?: boolean
    notifiedAt?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["waitlistEntry"]>

  export type WaitlistEntrySelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    partySize?: boolean
    guestName?: boolean
    guestPhone?: boolean
    position?: boolean
    estimatedWaitMinutes?: boolean
    status?: boolean
    notifiedAt?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["waitlistEntry"]>

  export type WaitlistEntrySelectScalar = {
    id?: boolean
    venueId?: boolean
    partySize?: boolean
    guestName?: boolean
    guestPhone?: boolean
    position?: boolean
    estimatedWaitMinutes?: boolean
    status?: boolean
    notifiedAt?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }

  export type WaitlistEntryOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "venueId" | "partySize" | "guestName" | "guestPhone" | "position" | "estimatedWaitMinutes" | "status" | "notifiedAt" | "expiresAt" | "createdAt" | "updatedAt", ExtArgs["result"]["waitlistEntry"]>

  export type $WaitlistEntryPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WaitlistEntry"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      venueId: string
      partySize: number
      guestName: string
      guestPhone: string
      position: number
      estimatedWaitMinutes: number
      status: $Enums.WaitlistStatus
      notifiedAt: Date | null
      expiresAt: Date | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["waitlistEntry"]>
    composites: {}
  }

  type WaitlistEntryGetPayload<S extends boolean | null | undefined | WaitlistEntryDefaultArgs> = $Result.GetResult<Prisma.$WaitlistEntryPayload, S>

  type WaitlistEntryCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<WaitlistEntryFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: WaitlistEntryCountAggregateInputType | true
    }

  export interface WaitlistEntryDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WaitlistEntry'], meta: { name: 'WaitlistEntry' } }
    /**
     * Find zero or one WaitlistEntry that matches the filter.
     * @param {WaitlistEntryFindUniqueArgs} args - Arguments to find a WaitlistEntry
     * @example
     * // Get one WaitlistEntry
     * const waitlistEntry = await prisma.waitlistEntry.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WaitlistEntryFindUniqueArgs>(args: SelectSubset<T, WaitlistEntryFindUniqueArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one WaitlistEntry that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {WaitlistEntryFindUniqueOrThrowArgs} args - Arguments to find a WaitlistEntry
     * @example
     * // Get one WaitlistEntry
     * const waitlistEntry = await prisma.waitlistEntry.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WaitlistEntryFindUniqueOrThrowArgs>(args: SelectSubset<T, WaitlistEntryFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WaitlistEntry that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryFindFirstArgs} args - Arguments to find a WaitlistEntry
     * @example
     * // Get one WaitlistEntry
     * const waitlistEntry = await prisma.waitlistEntry.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WaitlistEntryFindFirstArgs>(args?: SelectSubset<T, WaitlistEntryFindFirstArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first WaitlistEntry that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryFindFirstOrThrowArgs} args - Arguments to find a WaitlistEntry
     * @example
     * // Get one WaitlistEntry
     * const waitlistEntry = await prisma.waitlistEntry.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WaitlistEntryFindFirstOrThrowArgs>(args?: SelectSubset<T, WaitlistEntryFindFirstOrThrowArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more WaitlistEntries that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WaitlistEntries
     * const waitlistEntries = await prisma.waitlistEntry.findMany()
     * 
     * // Get first 10 WaitlistEntries
     * const waitlistEntries = await prisma.waitlistEntry.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const waitlistEntryWithIdOnly = await prisma.waitlistEntry.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WaitlistEntryFindManyArgs>(args?: SelectSubset<T, WaitlistEntryFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a WaitlistEntry.
     * @param {WaitlistEntryCreateArgs} args - Arguments to create a WaitlistEntry.
     * @example
     * // Create one WaitlistEntry
     * const WaitlistEntry = await prisma.waitlistEntry.create({
     *   data: {
     *     // ... data to create a WaitlistEntry
     *   }
     * })
     * 
     */
    create<T extends WaitlistEntryCreateArgs>(args: SelectSubset<T, WaitlistEntryCreateArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many WaitlistEntries.
     * @param {WaitlistEntryCreateManyArgs} args - Arguments to create many WaitlistEntries.
     * @example
     * // Create many WaitlistEntries
     * const waitlistEntry = await prisma.waitlistEntry.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WaitlistEntryCreateManyArgs>(args?: SelectSubset<T, WaitlistEntryCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WaitlistEntries and returns the data saved in the database.
     * @param {WaitlistEntryCreateManyAndReturnArgs} args - Arguments to create many WaitlistEntries.
     * @example
     * // Create many WaitlistEntries
     * const waitlistEntry = await prisma.waitlistEntry.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WaitlistEntries and only return the `id`
     * const waitlistEntryWithIdOnly = await prisma.waitlistEntry.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WaitlistEntryCreateManyAndReturnArgs>(args?: SelectSubset<T, WaitlistEntryCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a WaitlistEntry.
     * @param {WaitlistEntryDeleteArgs} args - Arguments to delete one WaitlistEntry.
     * @example
     * // Delete one WaitlistEntry
     * const WaitlistEntry = await prisma.waitlistEntry.delete({
     *   where: {
     *     // ... filter to delete one WaitlistEntry
     *   }
     * })
     * 
     */
    delete<T extends WaitlistEntryDeleteArgs>(args: SelectSubset<T, WaitlistEntryDeleteArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one WaitlistEntry.
     * @param {WaitlistEntryUpdateArgs} args - Arguments to update one WaitlistEntry.
     * @example
     * // Update one WaitlistEntry
     * const waitlistEntry = await prisma.waitlistEntry.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WaitlistEntryUpdateArgs>(args: SelectSubset<T, WaitlistEntryUpdateArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more WaitlistEntries.
     * @param {WaitlistEntryDeleteManyArgs} args - Arguments to filter WaitlistEntries to delete.
     * @example
     * // Delete a few WaitlistEntries
     * const { count } = await prisma.waitlistEntry.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WaitlistEntryDeleteManyArgs>(args?: SelectSubset<T, WaitlistEntryDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WaitlistEntries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WaitlistEntries
     * const waitlistEntry = await prisma.waitlistEntry.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WaitlistEntryUpdateManyArgs>(args: SelectSubset<T, WaitlistEntryUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WaitlistEntries and returns the data updated in the database.
     * @param {WaitlistEntryUpdateManyAndReturnArgs} args - Arguments to update many WaitlistEntries.
     * @example
     * // Update many WaitlistEntries
     * const waitlistEntry = await prisma.waitlistEntry.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more WaitlistEntries and only return the `id`
     * const waitlistEntryWithIdOnly = await prisma.waitlistEntry.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends WaitlistEntryUpdateManyAndReturnArgs>(args: SelectSubset<T, WaitlistEntryUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one WaitlistEntry.
     * @param {WaitlistEntryUpsertArgs} args - Arguments to update or create a WaitlistEntry.
     * @example
     * // Update or create a WaitlistEntry
     * const waitlistEntry = await prisma.waitlistEntry.upsert({
     *   create: {
     *     // ... data to create a WaitlistEntry
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WaitlistEntry we want to update
     *   }
     * })
     */
    upsert<T extends WaitlistEntryUpsertArgs>(args: SelectSubset<T, WaitlistEntryUpsertArgs<ExtArgs>>): Prisma__WaitlistEntryClient<$Result.GetResult<Prisma.$WaitlistEntryPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of WaitlistEntries.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryCountArgs} args - Arguments to filter WaitlistEntries to count.
     * @example
     * // Count the number of WaitlistEntries
     * const count = await prisma.waitlistEntry.count({
     *   where: {
     *     // ... the filter for the WaitlistEntries we want to count
     *   }
     * })
    **/
    count<T extends WaitlistEntryCountArgs>(
      args?: Subset<T, WaitlistEntryCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WaitlistEntryCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WaitlistEntry.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WaitlistEntryAggregateArgs>(args: Subset<T, WaitlistEntryAggregateArgs>): Prisma.PrismaPromise<GetWaitlistEntryAggregateType<T>>

    /**
     * Group by WaitlistEntry.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WaitlistEntryGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WaitlistEntryGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WaitlistEntryGroupByArgs['orderBy'] }
        : { orderBy?: WaitlistEntryGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WaitlistEntryGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWaitlistEntryGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WaitlistEntry model
   */
  readonly fields: WaitlistEntryFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WaitlistEntry.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WaitlistEntryClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WaitlistEntry model
   */
  interface WaitlistEntryFieldRefs {
    readonly id: FieldRef<"WaitlistEntry", 'String'>
    readonly venueId: FieldRef<"WaitlistEntry", 'String'>
    readonly partySize: FieldRef<"WaitlistEntry", 'Int'>
    readonly guestName: FieldRef<"WaitlistEntry", 'String'>
    readonly guestPhone: FieldRef<"WaitlistEntry", 'String'>
    readonly position: FieldRef<"WaitlistEntry", 'Int'>
    readonly estimatedWaitMinutes: FieldRef<"WaitlistEntry", 'Int'>
    readonly status: FieldRef<"WaitlistEntry", 'WaitlistStatus'>
    readonly notifiedAt: FieldRef<"WaitlistEntry", 'DateTime'>
    readonly expiresAt: FieldRef<"WaitlistEntry", 'DateTime'>
    readonly createdAt: FieldRef<"WaitlistEntry", 'DateTime'>
    readonly updatedAt: FieldRef<"WaitlistEntry", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * WaitlistEntry findUnique
   */
  export type WaitlistEntryFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * Filter, which WaitlistEntry to fetch.
     */
    where: WaitlistEntryWhereUniqueInput
  }

  /**
   * WaitlistEntry findUniqueOrThrow
   */
  export type WaitlistEntryFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * Filter, which WaitlistEntry to fetch.
     */
    where: WaitlistEntryWhereUniqueInput
  }

  /**
   * WaitlistEntry findFirst
   */
  export type WaitlistEntryFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * Filter, which WaitlistEntry to fetch.
     */
    where?: WaitlistEntryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WaitlistEntries to fetch.
     */
    orderBy?: WaitlistEntryOrderByWithRelationInput | WaitlistEntryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WaitlistEntries.
     */
    cursor?: WaitlistEntryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WaitlistEntries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WaitlistEntries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WaitlistEntries.
     */
    distinct?: WaitlistEntryScalarFieldEnum | WaitlistEntryScalarFieldEnum[]
  }

  /**
   * WaitlistEntry findFirstOrThrow
   */
  export type WaitlistEntryFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * Filter, which WaitlistEntry to fetch.
     */
    where?: WaitlistEntryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WaitlistEntries to fetch.
     */
    orderBy?: WaitlistEntryOrderByWithRelationInput | WaitlistEntryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WaitlistEntries.
     */
    cursor?: WaitlistEntryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WaitlistEntries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WaitlistEntries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WaitlistEntries.
     */
    distinct?: WaitlistEntryScalarFieldEnum | WaitlistEntryScalarFieldEnum[]
  }

  /**
   * WaitlistEntry findMany
   */
  export type WaitlistEntryFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * Filter, which WaitlistEntries to fetch.
     */
    where?: WaitlistEntryWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WaitlistEntries to fetch.
     */
    orderBy?: WaitlistEntryOrderByWithRelationInput | WaitlistEntryOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WaitlistEntries.
     */
    cursor?: WaitlistEntryWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WaitlistEntries from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WaitlistEntries.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WaitlistEntries.
     */
    distinct?: WaitlistEntryScalarFieldEnum | WaitlistEntryScalarFieldEnum[]
  }

  /**
   * WaitlistEntry create
   */
  export type WaitlistEntryCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * The data needed to create a WaitlistEntry.
     */
    data: XOR<WaitlistEntryCreateInput, WaitlistEntryUncheckedCreateInput>
  }

  /**
   * WaitlistEntry createMany
   */
  export type WaitlistEntryCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WaitlistEntries.
     */
    data: WaitlistEntryCreateManyInput | WaitlistEntryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WaitlistEntry createManyAndReturn
   */
  export type WaitlistEntryCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * The data used to create many WaitlistEntries.
     */
    data: WaitlistEntryCreateManyInput | WaitlistEntryCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WaitlistEntry update
   */
  export type WaitlistEntryUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * The data needed to update a WaitlistEntry.
     */
    data: XOR<WaitlistEntryUpdateInput, WaitlistEntryUncheckedUpdateInput>
    /**
     * Choose, which WaitlistEntry to update.
     */
    where: WaitlistEntryWhereUniqueInput
  }

  /**
   * WaitlistEntry updateMany
   */
  export type WaitlistEntryUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WaitlistEntries.
     */
    data: XOR<WaitlistEntryUpdateManyMutationInput, WaitlistEntryUncheckedUpdateManyInput>
    /**
     * Filter which WaitlistEntries to update
     */
    where?: WaitlistEntryWhereInput
    /**
     * Limit how many WaitlistEntries to update.
     */
    limit?: number
  }

  /**
   * WaitlistEntry updateManyAndReturn
   */
  export type WaitlistEntryUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * The data used to update WaitlistEntries.
     */
    data: XOR<WaitlistEntryUpdateManyMutationInput, WaitlistEntryUncheckedUpdateManyInput>
    /**
     * Filter which WaitlistEntries to update
     */
    where?: WaitlistEntryWhereInput
    /**
     * Limit how many WaitlistEntries to update.
     */
    limit?: number
  }

  /**
   * WaitlistEntry upsert
   */
  export type WaitlistEntryUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * The filter to search for the WaitlistEntry to update in case it exists.
     */
    where: WaitlistEntryWhereUniqueInput
    /**
     * In case the WaitlistEntry found by the `where` argument doesn't exist, create a new WaitlistEntry with this data.
     */
    create: XOR<WaitlistEntryCreateInput, WaitlistEntryUncheckedCreateInput>
    /**
     * In case the WaitlistEntry was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WaitlistEntryUpdateInput, WaitlistEntryUncheckedUpdateInput>
  }

  /**
   * WaitlistEntry delete
   */
  export type WaitlistEntryDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
    /**
     * Filter which WaitlistEntry to delete.
     */
    where: WaitlistEntryWhereUniqueInput
  }

  /**
   * WaitlistEntry deleteMany
   */
  export type WaitlistEntryDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WaitlistEntries to delete
     */
    where?: WaitlistEntryWhereInput
    /**
     * Limit how many WaitlistEntries to delete.
     */
    limit?: number
  }

  /**
   * WaitlistEntry without action
   */
  export type WaitlistEntryDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WaitlistEntry
     */
    select?: WaitlistEntrySelect<ExtArgs> | null
    /**
     * Omit specific fields from the WaitlistEntry
     */
    omit?: WaitlistEntryOmit<ExtArgs> | null
  }


  /**
   * Model ReservationHold
   */

  export type AggregateReservationHold = {
    _count: ReservationHoldCountAggregateOutputType | null
    _avg: ReservationHoldAvgAggregateOutputType | null
    _sum: ReservationHoldSumAggregateOutputType | null
    _min: ReservationHoldMinAggregateOutputType | null
    _max: ReservationHoldMaxAggregateOutputType | null
  }

  export type ReservationHoldAvgAggregateOutputType = {
    partySize: number | null
  }

  export type ReservationHoldSumAggregateOutputType = {
    partySize: number | null
  }

  export type ReservationHoldMinAggregateOutputType = {
    id: string | null
    venueId: string | null
    tableId: string | null
    date: Date | null
    startTime: Date | null
    endTime: Date | null
    partySize: number | null
    sessionId: string | null
    expiresAt: Date | null
    createdAt: Date | null
  }

  export type ReservationHoldMaxAggregateOutputType = {
    id: string | null
    venueId: string | null
    tableId: string | null
    date: Date | null
    startTime: Date | null
    endTime: Date | null
    partySize: number | null
    sessionId: string | null
    expiresAt: Date | null
    createdAt: Date | null
  }

  export type ReservationHoldCountAggregateOutputType = {
    id: number
    venueId: number
    tableId: number
    date: number
    startTime: number
    endTime: number
    partySize: number
    sessionId: number
    expiresAt: number
    createdAt: number
    _all: number
  }


  export type ReservationHoldAvgAggregateInputType = {
    partySize?: true
  }

  export type ReservationHoldSumAggregateInputType = {
    partySize?: true
  }

  export type ReservationHoldMinAggregateInputType = {
    id?: true
    venueId?: true
    tableId?: true
    date?: true
    startTime?: true
    endTime?: true
    partySize?: true
    sessionId?: true
    expiresAt?: true
    createdAt?: true
  }

  export type ReservationHoldMaxAggregateInputType = {
    id?: true
    venueId?: true
    tableId?: true
    date?: true
    startTime?: true
    endTime?: true
    partySize?: true
    sessionId?: true
    expiresAt?: true
    createdAt?: true
  }

  export type ReservationHoldCountAggregateInputType = {
    id?: true
    venueId?: true
    tableId?: true
    date?: true
    startTime?: true
    endTime?: true
    partySize?: true
    sessionId?: true
    expiresAt?: true
    createdAt?: true
    _all?: true
  }

  export type ReservationHoldAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ReservationHold to aggregate.
     */
    where?: ReservationHoldWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ReservationHolds to fetch.
     */
    orderBy?: ReservationHoldOrderByWithRelationInput | ReservationHoldOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: ReservationHoldWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ReservationHolds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ReservationHolds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned ReservationHolds
    **/
    _count?: true | ReservationHoldCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: ReservationHoldAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: ReservationHoldSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: ReservationHoldMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: ReservationHoldMaxAggregateInputType
  }

  export type GetReservationHoldAggregateType<T extends ReservationHoldAggregateArgs> = {
        [P in keyof T & keyof AggregateReservationHold]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateReservationHold[P]>
      : GetScalarType<T[P], AggregateReservationHold[P]>
  }




  export type ReservationHoldGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: ReservationHoldWhereInput
    orderBy?: ReservationHoldOrderByWithAggregationInput | ReservationHoldOrderByWithAggregationInput[]
    by: ReservationHoldScalarFieldEnum[] | ReservationHoldScalarFieldEnum
    having?: ReservationHoldScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: ReservationHoldCountAggregateInputType | true
    _avg?: ReservationHoldAvgAggregateInputType
    _sum?: ReservationHoldSumAggregateInputType
    _min?: ReservationHoldMinAggregateInputType
    _max?: ReservationHoldMaxAggregateInputType
  }

  export type ReservationHoldGroupByOutputType = {
    id: string
    venueId: string
    tableId: string
    date: Date
    startTime: Date
    endTime: Date
    partySize: number
    sessionId: string
    expiresAt: Date
    createdAt: Date
    _count: ReservationHoldCountAggregateOutputType | null
    _avg: ReservationHoldAvgAggregateOutputType | null
    _sum: ReservationHoldSumAggregateOutputType | null
    _min: ReservationHoldMinAggregateOutputType | null
    _max: ReservationHoldMaxAggregateOutputType | null
  }

  type GetReservationHoldGroupByPayload<T extends ReservationHoldGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<ReservationHoldGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof ReservationHoldGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], ReservationHoldGroupByOutputType[P]>
            : GetScalarType<T[P], ReservationHoldGroupByOutputType[P]>
        }
      >
    >


  export type ReservationHoldSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    tableId?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    sessionId?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["reservationHold"]>

  export type ReservationHoldSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    tableId?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    sessionId?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["reservationHold"]>

  export type ReservationHoldSelectUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    venueId?: boolean
    tableId?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    sessionId?: boolean
    expiresAt?: boolean
    createdAt?: boolean
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
  }, ExtArgs["result"]["reservationHold"]>

  export type ReservationHoldSelectScalar = {
    id?: boolean
    venueId?: boolean
    tableId?: boolean
    date?: boolean
    startTime?: boolean
    endTime?: boolean
    partySize?: boolean
    sessionId?: boolean
    expiresAt?: boolean
    createdAt?: boolean
  }

  export type ReservationHoldOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetOmit<"id" | "venueId" | "tableId" | "date" | "startTime" | "endTime" | "partySize" | "sessionId" | "expiresAt" | "createdAt", ExtArgs["result"]["reservationHold"]>
  export type ReservationHoldInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
  }
  export type ReservationHoldIncludeCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
  }
  export type ReservationHoldIncludeUpdateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    venue?: boolean | VenueDefaultArgs<ExtArgs>
    table?: boolean | TableDefaultArgs<ExtArgs>
  }

  export type $ReservationHoldPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "ReservationHold"
    objects: {
      venue: Prisma.$VenuePayload<ExtArgs>
      table: Prisma.$TablePayload<ExtArgs>
    }
    scalars: $Extensions.GetPayloadResult<{
      id: string
      venueId: string
      tableId: string
      date: Date
      startTime: Date
      endTime: Date
      partySize: number
      sessionId: string
      expiresAt: Date
      createdAt: Date
    }, ExtArgs["result"]["reservationHold"]>
    composites: {}
  }

  type ReservationHoldGetPayload<S extends boolean | null | undefined | ReservationHoldDefaultArgs> = $Result.GetResult<Prisma.$ReservationHoldPayload, S>

  type ReservationHoldCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<ReservationHoldFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
      select?: ReservationHoldCountAggregateInputType | true
    }

  export interface ReservationHoldDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['ReservationHold'], meta: { name: 'ReservationHold' } }
    /**
     * Find zero or one ReservationHold that matches the filter.
     * @param {ReservationHoldFindUniqueArgs} args - Arguments to find a ReservationHold
     * @example
     * // Get one ReservationHold
     * const reservationHold = await prisma.reservationHold.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends ReservationHoldFindUniqueArgs>(args: SelectSubset<T, ReservationHoldFindUniqueArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find one ReservationHold that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {ReservationHoldFindUniqueOrThrowArgs} args - Arguments to find a ReservationHold
     * @example
     * // Get one ReservationHold
     * const reservationHold = await prisma.reservationHold.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends ReservationHoldFindUniqueOrThrowArgs>(args: SelectSubset<T, ReservationHoldFindUniqueOrThrowArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ReservationHold that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldFindFirstArgs} args - Arguments to find a ReservationHold
     * @example
     * // Get one ReservationHold
     * const reservationHold = await prisma.reservationHold.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends ReservationHoldFindFirstArgs>(args?: SelectSubset<T, ReservationHoldFindFirstArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>

    /**
     * Find the first ReservationHold that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldFindFirstOrThrowArgs} args - Arguments to find a ReservationHold
     * @example
     * // Get one ReservationHold
     * const reservationHold = await prisma.reservationHold.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends ReservationHoldFindFirstOrThrowArgs>(args?: SelectSubset<T, ReservationHoldFindFirstOrThrowArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Find zero or more ReservationHolds that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all ReservationHolds
     * const reservationHolds = await prisma.reservationHold.findMany()
     * 
     * // Get first 10 ReservationHolds
     * const reservationHolds = await prisma.reservationHold.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const reservationHoldWithIdOnly = await prisma.reservationHold.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends ReservationHoldFindManyArgs>(args?: SelectSubset<T, ReservationHoldFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>

    /**
     * Create a ReservationHold.
     * @param {ReservationHoldCreateArgs} args - Arguments to create a ReservationHold.
     * @example
     * // Create one ReservationHold
     * const ReservationHold = await prisma.reservationHold.create({
     *   data: {
     *     // ... data to create a ReservationHold
     *   }
     * })
     * 
     */
    create<T extends ReservationHoldCreateArgs>(args: SelectSubset<T, ReservationHoldCreateArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Create many ReservationHolds.
     * @param {ReservationHoldCreateManyArgs} args - Arguments to create many ReservationHolds.
     * @example
     * // Create many ReservationHolds
     * const reservationHold = await prisma.reservationHold.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends ReservationHoldCreateManyArgs>(args?: SelectSubset<T, ReservationHoldCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many ReservationHolds and returns the data saved in the database.
     * @param {ReservationHoldCreateManyAndReturnArgs} args - Arguments to create many ReservationHolds.
     * @example
     * // Create many ReservationHolds
     * const reservationHold = await prisma.reservationHold.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many ReservationHolds and only return the `id`
     * const reservationHoldWithIdOnly = await prisma.reservationHold.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends ReservationHoldCreateManyAndReturnArgs>(args?: SelectSubset<T, ReservationHoldCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>

    /**
     * Delete a ReservationHold.
     * @param {ReservationHoldDeleteArgs} args - Arguments to delete one ReservationHold.
     * @example
     * // Delete one ReservationHold
     * const ReservationHold = await prisma.reservationHold.delete({
     *   where: {
     *     // ... filter to delete one ReservationHold
     *   }
     * })
     * 
     */
    delete<T extends ReservationHoldDeleteArgs>(args: SelectSubset<T, ReservationHoldDeleteArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Update one ReservationHold.
     * @param {ReservationHoldUpdateArgs} args - Arguments to update one ReservationHold.
     * @example
     * // Update one ReservationHold
     * const reservationHold = await prisma.reservationHold.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends ReservationHoldUpdateArgs>(args: SelectSubset<T, ReservationHoldUpdateArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>

    /**
     * Delete zero or more ReservationHolds.
     * @param {ReservationHoldDeleteManyArgs} args - Arguments to filter ReservationHolds to delete.
     * @example
     * // Delete a few ReservationHolds
     * const { count } = await prisma.reservationHold.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends ReservationHoldDeleteManyArgs>(args?: SelectSubset<T, ReservationHoldDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ReservationHolds.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many ReservationHolds
     * const reservationHold = await prisma.reservationHold.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends ReservationHoldUpdateManyArgs>(args: SelectSubset<T, ReservationHoldUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more ReservationHolds and returns the data updated in the database.
     * @param {ReservationHoldUpdateManyAndReturnArgs} args - Arguments to update many ReservationHolds.
     * @example
     * // Update many ReservationHolds
     * const reservationHold = await prisma.reservationHold.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Update zero or more ReservationHolds and only return the `id`
     * const reservationHoldWithIdOnly = await prisma.reservationHold.updateManyAndReturn({
     *   select: { id: true },
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    updateManyAndReturn<T extends ReservationHoldUpdateManyAndReturnArgs>(args: SelectSubset<T, ReservationHoldUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>

    /**
     * Create or update one ReservationHold.
     * @param {ReservationHoldUpsertArgs} args - Arguments to update or create a ReservationHold.
     * @example
     * // Update or create a ReservationHold
     * const reservationHold = await prisma.reservationHold.upsert({
     *   create: {
     *     // ... data to create a ReservationHold
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the ReservationHold we want to update
     *   }
     * })
     */
    upsert<T extends ReservationHoldUpsertArgs>(args: SelectSubset<T, ReservationHoldUpsertArgs<ExtArgs>>): Prisma__ReservationHoldClient<$Result.GetResult<Prisma.$ReservationHoldPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>


    /**
     * Count the number of ReservationHolds.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldCountArgs} args - Arguments to filter ReservationHolds to count.
     * @example
     * // Count the number of ReservationHolds
     * const count = await prisma.reservationHold.count({
     *   where: {
     *     // ... the filter for the ReservationHolds we want to count
     *   }
     * })
    **/
    count<T extends ReservationHoldCountArgs>(
      args?: Subset<T, ReservationHoldCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], ReservationHoldCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a ReservationHold.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends ReservationHoldAggregateArgs>(args: Subset<T, ReservationHoldAggregateArgs>): Prisma.PrismaPromise<GetReservationHoldAggregateType<T>>

    /**
     * Group by ReservationHold.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {ReservationHoldGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends ReservationHoldGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: ReservationHoldGroupByArgs['orderBy'] }
        : { orderBy?: ReservationHoldGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, ReservationHoldGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetReservationHoldGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the ReservationHold model
   */
  readonly fields: ReservationHoldFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for ReservationHold.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__ReservationHoldClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    venue<T extends VenueDefaultArgs<ExtArgs> = {}>(args?: Subset<T, VenueDefaultArgs<ExtArgs>>): Prisma__VenueClient<$Result.GetResult<Prisma.$VenuePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    table<T extends TableDefaultArgs<ExtArgs> = {}>(args?: Subset<T, TableDefaultArgs<ExtArgs>>): Prisma__TableClient<$Result.GetResult<Prisma.$TablePayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the ReservationHold model
   */
  interface ReservationHoldFieldRefs {
    readonly id: FieldRef<"ReservationHold", 'String'>
    readonly venueId: FieldRef<"ReservationHold", 'String'>
    readonly tableId: FieldRef<"ReservationHold", 'String'>
    readonly date: FieldRef<"ReservationHold", 'DateTime'>
    readonly startTime: FieldRef<"ReservationHold", 'DateTime'>
    readonly endTime: FieldRef<"ReservationHold", 'DateTime'>
    readonly partySize: FieldRef<"ReservationHold", 'Int'>
    readonly sessionId: FieldRef<"ReservationHold", 'String'>
    readonly expiresAt: FieldRef<"ReservationHold", 'DateTime'>
    readonly createdAt: FieldRef<"ReservationHold", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * ReservationHold findUnique
   */
  export type ReservationHoldFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * Filter, which ReservationHold to fetch.
     */
    where: ReservationHoldWhereUniqueInput
  }

  /**
   * ReservationHold findUniqueOrThrow
   */
  export type ReservationHoldFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * Filter, which ReservationHold to fetch.
     */
    where: ReservationHoldWhereUniqueInput
  }

  /**
   * ReservationHold findFirst
   */
  export type ReservationHoldFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * Filter, which ReservationHold to fetch.
     */
    where?: ReservationHoldWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ReservationHolds to fetch.
     */
    orderBy?: ReservationHoldOrderByWithRelationInput | ReservationHoldOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ReservationHolds.
     */
    cursor?: ReservationHoldWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ReservationHolds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ReservationHolds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ReservationHolds.
     */
    distinct?: ReservationHoldScalarFieldEnum | ReservationHoldScalarFieldEnum[]
  }

  /**
   * ReservationHold findFirstOrThrow
   */
  export type ReservationHoldFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * Filter, which ReservationHold to fetch.
     */
    where?: ReservationHoldWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ReservationHolds to fetch.
     */
    orderBy?: ReservationHoldOrderByWithRelationInput | ReservationHoldOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for ReservationHolds.
     */
    cursor?: ReservationHoldWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ReservationHolds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ReservationHolds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ReservationHolds.
     */
    distinct?: ReservationHoldScalarFieldEnum | ReservationHoldScalarFieldEnum[]
  }

  /**
   * ReservationHold findMany
   */
  export type ReservationHoldFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * Filter, which ReservationHolds to fetch.
     */
    where?: ReservationHoldWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of ReservationHolds to fetch.
     */
    orderBy?: ReservationHoldOrderByWithRelationInput | ReservationHoldOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing ReservationHolds.
     */
    cursor?: ReservationHoldWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` ReservationHolds from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` ReservationHolds.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of ReservationHolds.
     */
    distinct?: ReservationHoldScalarFieldEnum | ReservationHoldScalarFieldEnum[]
  }

  /**
   * ReservationHold create
   */
  export type ReservationHoldCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * The data needed to create a ReservationHold.
     */
    data: XOR<ReservationHoldCreateInput, ReservationHoldUncheckedCreateInput>
  }

  /**
   * ReservationHold createMany
   */
  export type ReservationHoldCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many ReservationHolds.
     */
    data: ReservationHoldCreateManyInput | ReservationHoldCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * ReservationHold createManyAndReturn
   */
  export type ReservationHoldCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * The data used to create many ReservationHolds.
     */
    data: ReservationHoldCreateManyInput | ReservationHoldCreateManyInput[]
    skipDuplicates?: boolean
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldIncludeCreateManyAndReturn<ExtArgs> | null
  }

  /**
   * ReservationHold update
   */
  export type ReservationHoldUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * The data needed to update a ReservationHold.
     */
    data: XOR<ReservationHoldUpdateInput, ReservationHoldUncheckedUpdateInput>
    /**
     * Choose, which ReservationHold to update.
     */
    where: ReservationHoldWhereUniqueInput
  }

  /**
   * ReservationHold updateMany
   */
  export type ReservationHoldUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update ReservationHolds.
     */
    data: XOR<ReservationHoldUpdateManyMutationInput, ReservationHoldUncheckedUpdateManyInput>
    /**
     * Filter which ReservationHolds to update
     */
    where?: ReservationHoldWhereInput
    /**
     * Limit how many ReservationHolds to update.
     */
    limit?: number
  }

  /**
   * ReservationHold updateManyAndReturn
   */
  export type ReservationHoldUpdateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelectUpdateManyAndReturn<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * The data used to update ReservationHolds.
     */
    data: XOR<ReservationHoldUpdateManyMutationInput, ReservationHoldUncheckedUpdateManyInput>
    /**
     * Filter which ReservationHolds to update
     */
    where?: ReservationHoldWhereInput
    /**
     * Limit how many ReservationHolds to update.
     */
    limit?: number
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldIncludeUpdateManyAndReturn<ExtArgs> | null
  }

  /**
   * ReservationHold upsert
   */
  export type ReservationHoldUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * The filter to search for the ReservationHold to update in case it exists.
     */
    where: ReservationHoldWhereUniqueInput
    /**
     * In case the ReservationHold found by the `where` argument doesn't exist, create a new ReservationHold with this data.
     */
    create: XOR<ReservationHoldCreateInput, ReservationHoldUncheckedCreateInput>
    /**
     * In case the ReservationHold was found with the provided `where` argument, update it with this data.
     */
    update: XOR<ReservationHoldUpdateInput, ReservationHoldUncheckedUpdateInput>
  }

  /**
   * ReservationHold delete
   */
  export type ReservationHoldDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
    /**
     * Filter which ReservationHold to delete.
     */
    where: ReservationHoldWhereUniqueInput
  }

  /**
   * ReservationHold deleteMany
   */
  export type ReservationHoldDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which ReservationHolds to delete
     */
    where?: ReservationHoldWhereInput
    /**
     * Limit how many ReservationHolds to delete.
     */
    limit?: number
  }

  /**
   * ReservationHold without action
   */
  export type ReservationHoldDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the ReservationHold
     */
    select?: ReservationHoldSelect<ExtArgs> | null
    /**
     * Omit specific fields from the ReservationHold
     */
    omit?: ReservationHoldOmit<ExtArgs> | null
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: ReservationHoldInclude<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const VenueGroupScalarFieldEnum: {
    id: 'id',
    name: 'name',
    slug: 'slug',
    settings: 'settings',
    createdAt: 'createdAt'
  };

  export type VenueGroupScalarFieldEnum = (typeof VenueGroupScalarFieldEnum)[keyof typeof VenueGroupScalarFieldEnum]


  export const VenueScalarFieldEnum: {
    id: 'id',
    venueGroupId: 'venueGroupId',
    name: 'name',
    slug: 'slug',
    ianaTimezone: 'ianaTimezone',
    currencyCode: 'currencyCode',
    operatingHours: 'operatingHours',
    settings: 'settings',
    depositEnabled: 'depositEnabled',
    depositType: 'depositType',
    depositAmountCents: 'depositAmountCents',
    freeCancellationHours: 'freeCancellationHours',
    lateCancellationFeePercent: 'lateCancellationFeePercent',
    noShowFeePercent: 'noShowFeePercent',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type VenueScalarFieldEnum = (typeof VenueScalarFieldEnum)[keyof typeof VenueScalarFieldEnum]


  export const FloorPlanScalarFieldEnum: {
    id: 'id',
    venueId: 'venueId',
    name: 'name',
    isActive: 'isActive',
    layoutJson: 'layoutJson',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type FloorPlanScalarFieldEnum = (typeof FloorPlanScalarFieldEnum)[keyof typeof FloorPlanScalarFieldEnum]


  export const TableScalarFieldEnum: {
    id: 'id',
    name: 'name',
    tableNumber: 'tableNumber',
    capacity: 'capacity',
    minCovers: 'minCovers',
    maxCovers: 'maxCovers',
    location: 'location',
    isActive: 'isActive',
    status: 'status',
    priority: 'priority',
    venueId: 'venueId',
    floorPlanId: 'floorPlanId',
    shapeMetadata: 'shapeMetadata',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type TableScalarFieldEnum = (typeof TableScalarFieldEnum)[keyof typeof TableScalarFieldEnum]


  export const GuestScalarFieldEnum: {
    id: 'id',
    venueId: 'venueId',
    email: 'email',
    phone: 'phone',
    name: 'name',
    notes: 'notes',
    visitCount: 'visitCount',
    lifetimeSpend: 'lifetimeSpend',
    lastVisit: 'lastVisit',
    tags: 'tags',
    dietaryRestrictions: 'dietaryRestrictions',
    staffNotes: 'staffNotes',
    communicationPreference: 'communicationPreference',
    stripeCustomerId: 'stripeCustomerId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type GuestScalarFieldEnum = (typeof GuestScalarFieldEnum)[keyof typeof GuestScalarFieldEnum]


  export const ReservationScalarFieldEnum: {
    id: 'id',
    date: 'date',
    startTime: 'startTime',
    endTime: 'endTime',
    partySize: 'partySize',
    status: 'status',
    notes: 'notes',
    cancellationReason: 'cancellationReason',
    cancellationNote: 'cancellationNote',
    occasion: 'occasion',
    seatingPreference: 'seatingPreference',
    guestName: 'guestName',
    guestEmail: 'guestEmail',
    guestPhone: 'guestPhone',
    guestId: 'guestId',
    userId: 'userId',
    tableId: 'tableId',
    venueId: 'venueId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type ReservationScalarFieldEnum = (typeof ReservationScalarFieldEnum)[keyof typeof ReservationScalarFieldEnum]


  export const DepositScalarFieldEnum: {
    id: 'id',
    reservationId: 'reservationId',
    amountCents: 'amountCents',
    currency: 'currency',
    status: 'status',
    stripePaymentIntentId: 'stripePaymentIntentId',
    stripeCustomerId: 'stripeCustomerId',
    heldAt: 'heldAt',
    appliedAt: 'appliedAt',
    refundedAt: 'refundedAt',
    forfeitedAt: 'forfeitedAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type DepositScalarFieldEnum = (typeof DepositScalarFieldEnum)[keyof typeof DepositScalarFieldEnum]


  export const WaitlistEntryScalarFieldEnum: {
    id: 'id',
    venueId: 'venueId',
    partySize: 'partySize',
    guestName: 'guestName',
    guestPhone: 'guestPhone',
    position: 'position',
    estimatedWaitMinutes: 'estimatedWaitMinutes',
    status: 'status',
    notifiedAt: 'notifiedAt',
    expiresAt: 'expiresAt',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WaitlistEntryScalarFieldEnum = (typeof WaitlistEntryScalarFieldEnum)[keyof typeof WaitlistEntryScalarFieldEnum]


  export const ReservationHoldScalarFieldEnum: {
    id: 'id',
    venueId: 'venueId',
    tableId: 'tableId',
    date: 'date',
    startTime: 'startTime',
    endTime: 'endTime',
    partySize: 'partySize',
    sessionId: 'sessionId',
    expiresAt: 'expiresAt',
    createdAt: 'createdAt'
  };

  export type ReservationHoldScalarFieldEnum = (typeof ReservationHoldScalarFieldEnum)[keyof typeof ReservationHoldScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const NullableJsonNullValueInput: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull
  };

  export type NullableJsonNullValueInput = (typeof NullableJsonNullValueInput)[keyof typeof NullableJsonNullValueInput]


  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const JsonNullValueFilter: {
    DbNull: typeof DbNull,
    JsonNull: typeof JsonNull,
    AnyNull: typeof AnyNull
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Json'>
    


  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'QueryMode'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Boolean'>
    


  /**
   * Reference to a field of type 'DepositType'
   */
  export type EnumDepositTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositType'>
    


  /**
   * Reference to a field of type 'DepositType[]'
   */
  export type ListEnumDepositTypeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositType[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'TableStatus'
   */
  export type EnumTableStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TableStatus'>
    


  /**
   * Reference to a field of type 'TableStatus[]'
   */
  export type ListEnumTableStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'TableStatus[]'>
    


  /**
   * Reference to a field of type 'Decimal'
   */
  export type DecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal'>
    


  /**
   * Reference to a field of type 'Decimal[]'
   */
  export type ListDecimalFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Decimal[]'>
    


  /**
   * Reference to a field of type 'CommunicationPreference'
   */
  export type EnumCommunicationPreferenceFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'CommunicationPreference'>
    


  /**
   * Reference to a field of type 'CommunicationPreference[]'
   */
  export type ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'CommunicationPreference[]'>
    


  /**
   * Reference to a field of type 'ReservationStatus'
   */
  export type EnumReservationStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ReservationStatus'>
    


  /**
   * Reference to a field of type 'ReservationStatus[]'
   */
  export type ListEnumReservationStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'ReservationStatus[]'>
    


  /**
   * Reference to a field of type 'Occasion'
   */
  export type EnumOccasionFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Occasion'>
    


  /**
   * Reference to a field of type 'Occasion[]'
   */
  export type ListEnumOccasionFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Occasion[]'>
    


  /**
   * Reference to a field of type 'SeatingPreference'
   */
  export type EnumSeatingPreferenceFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SeatingPreference'>
    


  /**
   * Reference to a field of type 'SeatingPreference[]'
   */
  export type ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'SeatingPreference[]'>
    


  /**
   * Reference to a field of type 'DepositStatus'
   */
  export type EnumDepositStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositStatus'>
    


  /**
   * Reference to a field of type 'DepositStatus[]'
   */
  export type ListEnumDepositStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DepositStatus[]'>
    


  /**
   * Reference to a field of type 'WaitlistStatus'
   */
  export type EnumWaitlistStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'WaitlistStatus'>
    


  /**
   * Reference to a field of type 'WaitlistStatus[]'
   */
  export type ListEnumWaitlistStatusFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'WaitlistStatus[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type VenueGroupWhereInput = {
    AND?: VenueGroupWhereInput | VenueGroupWhereInput[]
    OR?: VenueGroupWhereInput[]
    NOT?: VenueGroupWhereInput | VenueGroupWhereInput[]
    id?: StringFilter<"VenueGroup"> | string
    name?: StringFilter<"VenueGroup"> | string
    slug?: StringFilter<"VenueGroup"> | string
    settings?: JsonNullableFilter<"VenueGroup">
    createdAt?: DateTimeFilter<"VenueGroup"> | Date | string
    venues?: VenueListRelationFilter
  }

  export type VenueGroupOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    settings?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    venues?: VenueOrderByRelationAggregateInput
  }

  export type VenueGroupWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    slug?: string
    AND?: VenueGroupWhereInput | VenueGroupWhereInput[]
    OR?: VenueGroupWhereInput[]
    NOT?: VenueGroupWhereInput | VenueGroupWhereInput[]
    name?: StringFilter<"VenueGroup"> | string
    settings?: JsonNullableFilter<"VenueGroup">
    createdAt?: DateTimeFilter<"VenueGroup"> | Date | string
    venues?: VenueListRelationFilter
  }, "id" | "slug">

  export type VenueGroupOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    settings?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    _count?: VenueGroupCountOrderByAggregateInput
    _max?: VenueGroupMaxOrderByAggregateInput
    _min?: VenueGroupMinOrderByAggregateInput
  }

  export type VenueGroupScalarWhereWithAggregatesInput = {
    AND?: VenueGroupScalarWhereWithAggregatesInput | VenueGroupScalarWhereWithAggregatesInput[]
    OR?: VenueGroupScalarWhereWithAggregatesInput[]
    NOT?: VenueGroupScalarWhereWithAggregatesInput | VenueGroupScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"VenueGroup"> | string
    name?: StringWithAggregatesFilter<"VenueGroup"> | string
    slug?: StringWithAggregatesFilter<"VenueGroup"> | string
    settings?: JsonNullableWithAggregatesFilter<"VenueGroup">
    createdAt?: DateTimeWithAggregatesFilter<"VenueGroup"> | Date | string
  }

  export type VenueWhereInput = {
    AND?: VenueWhereInput | VenueWhereInput[]
    OR?: VenueWhereInput[]
    NOT?: VenueWhereInput | VenueWhereInput[]
    id?: StringFilter<"Venue"> | string
    venueGroupId?: StringNullableFilter<"Venue"> | string | null
    name?: StringFilter<"Venue"> | string
    slug?: StringFilter<"Venue"> | string
    ianaTimezone?: StringFilter<"Venue"> | string
    currencyCode?: StringFilter<"Venue"> | string
    operatingHours?: JsonNullableFilter<"Venue">
    settings?: JsonNullableFilter<"Venue">
    depositEnabled?: BoolFilter<"Venue"> | boolean
    depositType?: EnumDepositTypeNullableFilter<"Venue"> | $Enums.DepositType | null
    depositAmountCents?: IntNullableFilter<"Venue"> | number | null
    freeCancellationHours?: IntNullableFilter<"Venue"> | number | null
    lateCancellationFeePercent?: IntNullableFilter<"Venue"> | number | null
    noShowFeePercent?: IntNullableFilter<"Venue"> | number | null
    createdAt?: DateTimeFilter<"Venue"> | Date | string
    updatedAt?: DateTimeFilter<"Venue"> | Date | string
    venueGroup?: XOR<VenueGroupNullableScalarRelationFilter, VenueGroupWhereInput> | null
    tables?: TableListRelationFilter
    reservations?: ReservationListRelationFilter
    guests?: GuestListRelationFilter
    floorPlans?: FloorPlanListRelationFilter
    holds?: ReservationHoldListRelationFilter
  }

  export type VenueOrderByWithRelationInput = {
    id?: SortOrder
    venueGroupId?: SortOrderInput | SortOrder
    name?: SortOrder
    slug?: SortOrder
    ianaTimezone?: SortOrder
    currencyCode?: SortOrder
    operatingHours?: SortOrderInput | SortOrder
    settings?: SortOrderInput | SortOrder
    depositEnabled?: SortOrder
    depositType?: SortOrderInput | SortOrder
    depositAmountCents?: SortOrderInput | SortOrder
    freeCancellationHours?: SortOrderInput | SortOrder
    lateCancellationFeePercent?: SortOrderInput | SortOrder
    noShowFeePercent?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    venueGroup?: VenueGroupOrderByWithRelationInput
    tables?: TableOrderByRelationAggregateInput
    reservations?: ReservationOrderByRelationAggregateInput
    guests?: GuestOrderByRelationAggregateInput
    floorPlans?: FloorPlanOrderByRelationAggregateInput
    holds?: ReservationHoldOrderByRelationAggregateInput
  }

  export type VenueWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    venueGroupId_slug?: VenueVenueGroupIdSlugCompoundUniqueInput
    AND?: VenueWhereInput | VenueWhereInput[]
    OR?: VenueWhereInput[]
    NOT?: VenueWhereInput | VenueWhereInput[]
    venueGroupId?: StringNullableFilter<"Venue"> | string | null
    name?: StringFilter<"Venue"> | string
    slug?: StringFilter<"Venue"> | string
    ianaTimezone?: StringFilter<"Venue"> | string
    currencyCode?: StringFilter<"Venue"> | string
    operatingHours?: JsonNullableFilter<"Venue">
    settings?: JsonNullableFilter<"Venue">
    depositEnabled?: BoolFilter<"Venue"> | boolean
    depositType?: EnumDepositTypeNullableFilter<"Venue"> | $Enums.DepositType | null
    depositAmountCents?: IntNullableFilter<"Venue"> | number | null
    freeCancellationHours?: IntNullableFilter<"Venue"> | number | null
    lateCancellationFeePercent?: IntNullableFilter<"Venue"> | number | null
    noShowFeePercent?: IntNullableFilter<"Venue"> | number | null
    createdAt?: DateTimeFilter<"Venue"> | Date | string
    updatedAt?: DateTimeFilter<"Venue"> | Date | string
    venueGroup?: XOR<VenueGroupNullableScalarRelationFilter, VenueGroupWhereInput> | null
    tables?: TableListRelationFilter
    reservations?: ReservationListRelationFilter
    guests?: GuestListRelationFilter
    floorPlans?: FloorPlanListRelationFilter
    holds?: ReservationHoldListRelationFilter
  }, "id" | "venueGroupId_slug">

  export type VenueOrderByWithAggregationInput = {
    id?: SortOrder
    venueGroupId?: SortOrderInput | SortOrder
    name?: SortOrder
    slug?: SortOrder
    ianaTimezone?: SortOrder
    currencyCode?: SortOrder
    operatingHours?: SortOrderInput | SortOrder
    settings?: SortOrderInput | SortOrder
    depositEnabled?: SortOrder
    depositType?: SortOrderInput | SortOrder
    depositAmountCents?: SortOrderInput | SortOrder
    freeCancellationHours?: SortOrderInput | SortOrder
    lateCancellationFeePercent?: SortOrderInput | SortOrder
    noShowFeePercent?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: VenueCountOrderByAggregateInput
    _avg?: VenueAvgOrderByAggregateInput
    _max?: VenueMaxOrderByAggregateInput
    _min?: VenueMinOrderByAggregateInput
    _sum?: VenueSumOrderByAggregateInput
  }

  export type VenueScalarWhereWithAggregatesInput = {
    AND?: VenueScalarWhereWithAggregatesInput | VenueScalarWhereWithAggregatesInput[]
    OR?: VenueScalarWhereWithAggregatesInput[]
    NOT?: VenueScalarWhereWithAggregatesInput | VenueScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Venue"> | string
    venueGroupId?: StringNullableWithAggregatesFilter<"Venue"> | string | null
    name?: StringWithAggregatesFilter<"Venue"> | string
    slug?: StringWithAggregatesFilter<"Venue"> | string
    ianaTimezone?: StringWithAggregatesFilter<"Venue"> | string
    currencyCode?: StringWithAggregatesFilter<"Venue"> | string
    operatingHours?: JsonNullableWithAggregatesFilter<"Venue">
    settings?: JsonNullableWithAggregatesFilter<"Venue">
    depositEnabled?: BoolWithAggregatesFilter<"Venue"> | boolean
    depositType?: EnumDepositTypeNullableWithAggregatesFilter<"Venue"> | $Enums.DepositType | null
    depositAmountCents?: IntNullableWithAggregatesFilter<"Venue"> | number | null
    freeCancellationHours?: IntNullableWithAggregatesFilter<"Venue"> | number | null
    lateCancellationFeePercent?: IntNullableWithAggregatesFilter<"Venue"> | number | null
    noShowFeePercent?: IntNullableWithAggregatesFilter<"Venue"> | number | null
    createdAt?: DateTimeWithAggregatesFilter<"Venue"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Venue"> | Date | string
  }

  export type FloorPlanWhereInput = {
    AND?: FloorPlanWhereInput | FloorPlanWhereInput[]
    OR?: FloorPlanWhereInput[]
    NOT?: FloorPlanWhereInput | FloorPlanWhereInput[]
    id?: StringFilter<"FloorPlan"> | string
    venueId?: StringFilter<"FloorPlan"> | string
    name?: StringFilter<"FloorPlan"> | string
    isActive?: BoolFilter<"FloorPlan"> | boolean
    layoutJson?: JsonFilter<"FloorPlan">
    createdAt?: DateTimeFilter<"FloorPlan"> | Date | string
    updatedAt?: DateTimeFilter<"FloorPlan"> | Date | string
    venue?: XOR<VenueScalarRelationFilter, VenueWhereInput>
    tables?: TableListRelationFilter
  }

  export type FloorPlanOrderByWithRelationInput = {
    id?: SortOrder
    venueId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    layoutJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    venue?: VenueOrderByWithRelationInput
    tables?: TableOrderByRelationAggregateInput
  }

  export type FloorPlanWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: FloorPlanWhereInput | FloorPlanWhereInput[]
    OR?: FloorPlanWhereInput[]
    NOT?: FloorPlanWhereInput | FloorPlanWhereInput[]
    venueId?: StringFilter<"FloorPlan"> | string
    name?: StringFilter<"FloorPlan"> | string
    isActive?: BoolFilter<"FloorPlan"> | boolean
    layoutJson?: JsonFilter<"FloorPlan">
    createdAt?: DateTimeFilter<"FloorPlan"> | Date | string
    updatedAt?: DateTimeFilter<"FloorPlan"> | Date | string
    venue?: XOR<VenueScalarRelationFilter, VenueWhereInput>
    tables?: TableListRelationFilter
  }, "id">

  export type FloorPlanOrderByWithAggregationInput = {
    id?: SortOrder
    venueId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    layoutJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: FloorPlanCountOrderByAggregateInput
    _max?: FloorPlanMaxOrderByAggregateInput
    _min?: FloorPlanMinOrderByAggregateInput
  }

  export type FloorPlanScalarWhereWithAggregatesInput = {
    AND?: FloorPlanScalarWhereWithAggregatesInput | FloorPlanScalarWhereWithAggregatesInput[]
    OR?: FloorPlanScalarWhereWithAggregatesInput[]
    NOT?: FloorPlanScalarWhereWithAggregatesInput | FloorPlanScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"FloorPlan"> | string
    venueId?: StringWithAggregatesFilter<"FloorPlan"> | string
    name?: StringWithAggregatesFilter<"FloorPlan"> | string
    isActive?: BoolWithAggregatesFilter<"FloorPlan"> | boolean
    layoutJson?: JsonWithAggregatesFilter<"FloorPlan">
    createdAt?: DateTimeWithAggregatesFilter<"FloorPlan"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"FloorPlan"> | Date | string
  }

  export type TableWhereInput = {
    AND?: TableWhereInput | TableWhereInput[]
    OR?: TableWhereInput[]
    NOT?: TableWhereInput | TableWhereInput[]
    id?: StringFilter<"Table"> | string
    name?: StringFilter<"Table"> | string
    tableNumber?: StringNullableFilter<"Table"> | string | null
    capacity?: IntFilter<"Table"> | number
    minCovers?: IntFilter<"Table"> | number
    maxCovers?: IntNullableFilter<"Table"> | number | null
    location?: StringNullableFilter<"Table"> | string | null
    isActive?: BoolFilter<"Table"> | boolean
    status?: EnumTableStatusFilter<"Table"> | $Enums.TableStatus
    priority?: IntFilter<"Table"> | number
    venueId?: StringNullableFilter<"Table"> | string | null
    floorPlanId?: StringNullableFilter<"Table"> | string | null
    shapeMetadata?: JsonNullableFilter<"Table">
    createdAt?: DateTimeFilter<"Table"> | Date | string
    updatedAt?: DateTimeFilter<"Table"> | Date | string
    venue?: XOR<VenueNullableScalarRelationFilter, VenueWhereInput> | null
    floorPlan?: XOR<FloorPlanNullableScalarRelationFilter, FloorPlanWhereInput> | null
    reservations?: ReservationListRelationFilter
    holds?: ReservationHoldListRelationFilter
  }

  export type TableOrderByWithRelationInput = {
    id?: SortOrder
    name?: SortOrder
    tableNumber?: SortOrderInput | SortOrder
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrderInput | SortOrder
    location?: SortOrderInput | SortOrder
    isActive?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    venueId?: SortOrderInput | SortOrder
    floorPlanId?: SortOrderInput | SortOrder
    shapeMetadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    venue?: VenueOrderByWithRelationInput
    floorPlan?: FloorPlanOrderByWithRelationInput
    reservations?: ReservationOrderByRelationAggregateInput
    holds?: ReservationHoldOrderByRelationAggregateInput
  }

  export type TableWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    venueId_name?: TableVenueIdNameCompoundUniqueInput
    AND?: TableWhereInput | TableWhereInput[]
    OR?: TableWhereInput[]
    NOT?: TableWhereInput | TableWhereInput[]
    name?: StringFilter<"Table"> | string
    tableNumber?: StringNullableFilter<"Table"> | string | null
    capacity?: IntFilter<"Table"> | number
    minCovers?: IntFilter<"Table"> | number
    maxCovers?: IntNullableFilter<"Table"> | number | null
    location?: StringNullableFilter<"Table"> | string | null
    isActive?: BoolFilter<"Table"> | boolean
    status?: EnumTableStatusFilter<"Table"> | $Enums.TableStatus
    priority?: IntFilter<"Table"> | number
    venueId?: StringNullableFilter<"Table"> | string | null
    floorPlanId?: StringNullableFilter<"Table"> | string | null
    shapeMetadata?: JsonNullableFilter<"Table">
    createdAt?: DateTimeFilter<"Table"> | Date | string
    updatedAt?: DateTimeFilter<"Table"> | Date | string
    venue?: XOR<VenueNullableScalarRelationFilter, VenueWhereInput> | null
    floorPlan?: XOR<FloorPlanNullableScalarRelationFilter, FloorPlanWhereInput> | null
    reservations?: ReservationListRelationFilter
    holds?: ReservationHoldListRelationFilter
  }, "id" | "venueId_name">

  export type TableOrderByWithAggregationInput = {
    id?: SortOrder
    name?: SortOrder
    tableNumber?: SortOrderInput | SortOrder
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrderInput | SortOrder
    location?: SortOrderInput | SortOrder
    isActive?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    venueId?: SortOrderInput | SortOrder
    floorPlanId?: SortOrderInput | SortOrder
    shapeMetadata?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: TableCountOrderByAggregateInput
    _avg?: TableAvgOrderByAggregateInput
    _max?: TableMaxOrderByAggregateInput
    _min?: TableMinOrderByAggregateInput
    _sum?: TableSumOrderByAggregateInput
  }

  export type TableScalarWhereWithAggregatesInput = {
    AND?: TableScalarWhereWithAggregatesInput | TableScalarWhereWithAggregatesInput[]
    OR?: TableScalarWhereWithAggregatesInput[]
    NOT?: TableScalarWhereWithAggregatesInput | TableScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Table"> | string
    name?: StringWithAggregatesFilter<"Table"> | string
    tableNumber?: StringNullableWithAggregatesFilter<"Table"> | string | null
    capacity?: IntWithAggregatesFilter<"Table"> | number
    minCovers?: IntWithAggregatesFilter<"Table"> | number
    maxCovers?: IntNullableWithAggregatesFilter<"Table"> | number | null
    location?: StringNullableWithAggregatesFilter<"Table"> | string | null
    isActive?: BoolWithAggregatesFilter<"Table"> | boolean
    status?: EnumTableStatusWithAggregatesFilter<"Table"> | $Enums.TableStatus
    priority?: IntWithAggregatesFilter<"Table"> | number
    venueId?: StringNullableWithAggregatesFilter<"Table"> | string | null
    floorPlanId?: StringNullableWithAggregatesFilter<"Table"> | string | null
    shapeMetadata?: JsonNullableWithAggregatesFilter<"Table">
    createdAt?: DateTimeWithAggregatesFilter<"Table"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Table"> | Date | string
  }

  export type GuestWhereInput = {
    AND?: GuestWhereInput | GuestWhereInput[]
    OR?: GuestWhereInput[]
    NOT?: GuestWhereInput | GuestWhereInput[]
    id?: StringFilter<"Guest"> | string
    venueId?: StringFilter<"Guest"> | string
    email?: StringNullableFilter<"Guest"> | string | null
    phone?: StringNullableFilter<"Guest"> | string | null
    name?: StringFilter<"Guest"> | string
    notes?: StringNullableFilter<"Guest"> | string | null
    visitCount?: IntFilter<"Guest"> | number
    lifetimeSpend?: DecimalNullableFilter<"Guest"> | Decimal | DecimalJsLike | number | string | null
    lastVisit?: DateTimeNullableFilter<"Guest"> | Date | string | null
    tags?: JsonNullableFilter<"Guest">
    dietaryRestrictions?: JsonNullableFilter<"Guest">
    staffNotes?: JsonNullableFilter<"Guest">
    communicationPreference?: EnumCommunicationPreferenceFilter<"Guest"> | $Enums.CommunicationPreference
    stripeCustomerId?: StringNullableFilter<"Guest"> | string | null
    createdAt?: DateTimeFilter<"Guest"> | Date | string
    updatedAt?: DateTimeFilter<"Guest"> | Date | string
    venue?: XOR<VenueScalarRelationFilter, VenueWhereInput>
    reservations?: ReservationListRelationFilter
  }

  export type GuestOrderByWithRelationInput = {
    id?: SortOrder
    venueId?: SortOrder
    email?: SortOrderInput | SortOrder
    phone?: SortOrderInput | SortOrder
    name?: SortOrder
    notes?: SortOrderInput | SortOrder
    visitCount?: SortOrder
    lifetimeSpend?: SortOrderInput | SortOrder
    lastVisit?: SortOrderInput | SortOrder
    tags?: SortOrderInput | SortOrder
    dietaryRestrictions?: SortOrderInput | SortOrder
    staffNotes?: SortOrderInput | SortOrder
    communicationPreference?: SortOrder
    stripeCustomerId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    venue?: VenueOrderByWithRelationInput
    reservations?: ReservationOrderByRelationAggregateInput
  }

  export type GuestWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    stripeCustomerId?: string
    venueId_email?: GuestVenueIdEmailCompoundUniqueInput
    venueId_phone?: GuestVenueIdPhoneCompoundUniqueInput
    AND?: GuestWhereInput | GuestWhereInput[]
    OR?: GuestWhereInput[]
    NOT?: GuestWhereInput | GuestWhereInput[]
    venueId?: StringFilter<"Guest"> | string
    email?: StringNullableFilter<"Guest"> | string | null
    phone?: StringNullableFilter<"Guest"> | string | null
    name?: StringFilter<"Guest"> | string
    notes?: StringNullableFilter<"Guest"> | string | null
    visitCount?: IntFilter<"Guest"> | number
    lifetimeSpend?: DecimalNullableFilter<"Guest"> | Decimal | DecimalJsLike | number | string | null
    lastVisit?: DateTimeNullableFilter<"Guest"> | Date | string | null
    tags?: JsonNullableFilter<"Guest">
    dietaryRestrictions?: JsonNullableFilter<"Guest">
    staffNotes?: JsonNullableFilter<"Guest">
    communicationPreference?: EnumCommunicationPreferenceFilter<"Guest"> | $Enums.CommunicationPreference
    createdAt?: DateTimeFilter<"Guest"> | Date | string
    updatedAt?: DateTimeFilter<"Guest"> | Date | string
    venue?: XOR<VenueScalarRelationFilter, VenueWhereInput>
    reservations?: ReservationListRelationFilter
  }, "id" | "stripeCustomerId" | "venueId_email" | "venueId_phone">

  export type GuestOrderByWithAggregationInput = {
    id?: SortOrder
    venueId?: SortOrder
    email?: SortOrderInput | SortOrder
    phone?: SortOrderInput | SortOrder
    name?: SortOrder
    notes?: SortOrderInput | SortOrder
    visitCount?: SortOrder
    lifetimeSpend?: SortOrderInput | SortOrder
    lastVisit?: SortOrderInput | SortOrder
    tags?: SortOrderInput | SortOrder
    dietaryRestrictions?: SortOrderInput | SortOrder
    staffNotes?: SortOrderInput | SortOrder
    communicationPreference?: SortOrder
    stripeCustomerId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: GuestCountOrderByAggregateInput
    _avg?: GuestAvgOrderByAggregateInput
    _max?: GuestMaxOrderByAggregateInput
    _min?: GuestMinOrderByAggregateInput
    _sum?: GuestSumOrderByAggregateInput
  }

  export type GuestScalarWhereWithAggregatesInput = {
    AND?: GuestScalarWhereWithAggregatesInput | GuestScalarWhereWithAggregatesInput[]
    OR?: GuestScalarWhereWithAggregatesInput[]
    NOT?: GuestScalarWhereWithAggregatesInput | GuestScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Guest"> | string
    venueId?: StringWithAggregatesFilter<"Guest"> | string
    email?: StringNullableWithAggregatesFilter<"Guest"> | string | null
    phone?: StringNullableWithAggregatesFilter<"Guest"> | string | null
    name?: StringWithAggregatesFilter<"Guest"> | string
    notes?: StringNullableWithAggregatesFilter<"Guest"> | string | null
    visitCount?: IntWithAggregatesFilter<"Guest"> | number
    lifetimeSpend?: DecimalNullableWithAggregatesFilter<"Guest"> | Decimal | DecimalJsLike | number | string | null
    lastVisit?: DateTimeNullableWithAggregatesFilter<"Guest"> | Date | string | null
    tags?: JsonNullableWithAggregatesFilter<"Guest">
    dietaryRestrictions?: JsonNullableWithAggregatesFilter<"Guest">
    staffNotes?: JsonNullableWithAggregatesFilter<"Guest">
    communicationPreference?: EnumCommunicationPreferenceWithAggregatesFilter<"Guest"> | $Enums.CommunicationPreference
    stripeCustomerId?: StringNullableWithAggregatesFilter<"Guest"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Guest"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Guest"> | Date | string
  }

  export type ReservationWhereInput = {
    AND?: ReservationWhereInput | ReservationWhereInput[]
    OR?: ReservationWhereInput[]
    NOT?: ReservationWhereInput | ReservationWhereInput[]
    id?: StringFilter<"Reservation"> | string
    date?: DateTimeFilter<"Reservation"> | Date | string
    startTime?: DateTimeFilter<"Reservation"> | Date | string
    endTime?: DateTimeFilter<"Reservation"> | Date | string
    partySize?: IntFilter<"Reservation"> | number
    status?: EnumReservationStatusFilter<"Reservation"> | $Enums.ReservationStatus
    notes?: StringNullableFilter<"Reservation"> | string | null
    cancellationReason?: StringNullableFilter<"Reservation"> | string | null
    cancellationNote?: StringNullableFilter<"Reservation"> | string | null
    occasion?: EnumOccasionNullableFilter<"Reservation"> | $Enums.Occasion | null
    seatingPreference?: EnumSeatingPreferenceNullableFilter<"Reservation"> | $Enums.SeatingPreference | null
    guestName?: StringNullableFilter<"Reservation"> | string | null
    guestEmail?: StringNullableFilter<"Reservation"> | string | null
    guestPhone?: StringNullableFilter<"Reservation"> | string | null
    guestId?: StringNullableFilter<"Reservation"> | string | null
    userId?: StringNullableFilter<"Reservation"> | string | null
    tableId?: StringFilter<"Reservation"> | string
    venueId?: StringNullableFilter<"Reservation"> | string | null
    createdAt?: DateTimeFilter<"Reservation"> | Date | string
    updatedAt?: DateTimeFilter<"Reservation"> | Date | string
    guest?: XOR<GuestNullableScalarRelationFilter, GuestWhereInput> | null
    table?: XOR<TableScalarRelationFilter, TableWhereInput>
    venue?: XOR<VenueNullableScalarRelationFilter, VenueWhereInput> | null
    deposit?: XOR<DepositNullableScalarRelationFilter, DepositWhereInput> | null
  }

  export type ReservationOrderByWithRelationInput = {
    id?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    status?: SortOrder
    notes?: SortOrderInput | SortOrder
    cancellationReason?: SortOrderInput | SortOrder
    cancellationNote?: SortOrderInput | SortOrder
    occasion?: SortOrderInput | SortOrder
    seatingPreference?: SortOrderInput | SortOrder
    guestName?: SortOrderInput | SortOrder
    guestEmail?: SortOrderInput | SortOrder
    guestPhone?: SortOrderInput | SortOrder
    guestId?: SortOrderInput | SortOrder
    userId?: SortOrderInput | SortOrder
    tableId?: SortOrder
    venueId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    guest?: GuestOrderByWithRelationInput
    table?: TableOrderByWithRelationInput
    venue?: VenueOrderByWithRelationInput
    deposit?: DepositOrderByWithRelationInput
  }

  export type ReservationWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ReservationWhereInput | ReservationWhereInput[]
    OR?: ReservationWhereInput[]
    NOT?: ReservationWhereInput | ReservationWhereInput[]
    date?: DateTimeFilter<"Reservation"> | Date | string
    startTime?: DateTimeFilter<"Reservation"> | Date | string
    endTime?: DateTimeFilter<"Reservation"> | Date | string
    partySize?: IntFilter<"Reservation"> | number
    status?: EnumReservationStatusFilter<"Reservation"> | $Enums.ReservationStatus
    notes?: StringNullableFilter<"Reservation"> | string | null
    cancellationReason?: StringNullableFilter<"Reservation"> | string | null
    cancellationNote?: StringNullableFilter<"Reservation"> | string | null
    occasion?: EnumOccasionNullableFilter<"Reservation"> | $Enums.Occasion | null
    seatingPreference?: EnumSeatingPreferenceNullableFilter<"Reservation"> | $Enums.SeatingPreference | null
    guestName?: StringNullableFilter<"Reservation"> | string | null
    guestEmail?: StringNullableFilter<"Reservation"> | string | null
    guestPhone?: StringNullableFilter<"Reservation"> | string | null
    guestId?: StringNullableFilter<"Reservation"> | string | null
    userId?: StringNullableFilter<"Reservation"> | string | null
    tableId?: StringFilter<"Reservation"> | string
    venueId?: StringNullableFilter<"Reservation"> | string | null
    createdAt?: DateTimeFilter<"Reservation"> | Date | string
    updatedAt?: DateTimeFilter<"Reservation"> | Date | string
    guest?: XOR<GuestNullableScalarRelationFilter, GuestWhereInput> | null
    table?: XOR<TableScalarRelationFilter, TableWhereInput>
    venue?: XOR<VenueNullableScalarRelationFilter, VenueWhereInput> | null
    deposit?: XOR<DepositNullableScalarRelationFilter, DepositWhereInput> | null
  }, "id">

  export type ReservationOrderByWithAggregationInput = {
    id?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    status?: SortOrder
    notes?: SortOrderInput | SortOrder
    cancellationReason?: SortOrderInput | SortOrder
    cancellationNote?: SortOrderInput | SortOrder
    occasion?: SortOrderInput | SortOrder
    seatingPreference?: SortOrderInput | SortOrder
    guestName?: SortOrderInput | SortOrder
    guestEmail?: SortOrderInput | SortOrder
    guestPhone?: SortOrderInput | SortOrder
    guestId?: SortOrderInput | SortOrder
    userId?: SortOrderInput | SortOrder
    tableId?: SortOrder
    venueId?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: ReservationCountOrderByAggregateInput
    _avg?: ReservationAvgOrderByAggregateInput
    _max?: ReservationMaxOrderByAggregateInput
    _min?: ReservationMinOrderByAggregateInput
    _sum?: ReservationSumOrderByAggregateInput
  }

  export type ReservationScalarWhereWithAggregatesInput = {
    AND?: ReservationScalarWhereWithAggregatesInput | ReservationScalarWhereWithAggregatesInput[]
    OR?: ReservationScalarWhereWithAggregatesInput[]
    NOT?: ReservationScalarWhereWithAggregatesInput | ReservationScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Reservation"> | string
    date?: DateTimeWithAggregatesFilter<"Reservation"> | Date | string
    startTime?: DateTimeWithAggregatesFilter<"Reservation"> | Date | string
    endTime?: DateTimeWithAggregatesFilter<"Reservation"> | Date | string
    partySize?: IntWithAggregatesFilter<"Reservation"> | number
    status?: EnumReservationStatusWithAggregatesFilter<"Reservation"> | $Enums.ReservationStatus
    notes?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    cancellationReason?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    cancellationNote?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    occasion?: EnumOccasionNullableWithAggregatesFilter<"Reservation"> | $Enums.Occasion | null
    seatingPreference?: EnumSeatingPreferenceNullableWithAggregatesFilter<"Reservation"> | $Enums.SeatingPreference | null
    guestName?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    guestEmail?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    guestPhone?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    guestId?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    userId?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    tableId?: StringWithAggregatesFilter<"Reservation"> | string
    venueId?: StringNullableWithAggregatesFilter<"Reservation"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Reservation"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Reservation"> | Date | string
  }

  export type DepositWhereInput = {
    AND?: DepositWhereInput | DepositWhereInput[]
    OR?: DepositWhereInput[]
    NOT?: DepositWhereInput | DepositWhereInput[]
    id?: StringFilter<"Deposit"> | string
    reservationId?: StringFilter<"Deposit"> | string
    amountCents?: IntFilter<"Deposit"> | number
    currency?: StringFilter<"Deposit"> | string
    status?: EnumDepositStatusFilter<"Deposit"> | $Enums.DepositStatus
    stripePaymentIntentId?: StringNullableFilter<"Deposit"> | string | null
    stripeCustomerId?: StringNullableFilter<"Deposit"> | string | null
    heldAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    appliedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    refundedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    forfeitedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    createdAt?: DateTimeFilter<"Deposit"> | Date | string
    updatedAt?: DateTimeFilter<"Deposit"> | Date | string
    reservation?: XOR<ReservationScalarRelationFilter, ReservationWhereInput>
  }

  export type DepositOrderByWithRelationInput = {
    id?: SortOrder
    reservationId?: SortOrder
    amountCents?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    stripePaymentIntentId?: SortOrderInput | SortOrder
    stripeCustomerId?: SortOrderInput | SortOrder
    heldAt?: SortOrderInput | SortOrder
    appliedAt?: SortOrderInput | SortOrder
    refundedAt?: SortOrderInput | SortOrder
    forfeitedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    reservation?: ReservationOrderByWithRelationInput
  }

  export type DepositWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    reservationId?: string
    AND?: DepositWhereInput | DepositWhereInput[]
    OR?: DepositWhereInput[]
    NOT?: DepositWhereInput | DepositWhereInput[]
    amountCents?: IntFilter<"Deposit"> | number
    currency?: StringFilter<"Deposit"> | string
    status?: EnumDepositStatusFilter<"Deposit"> | $Enums.DepositStatus
    stripePaymentIntentId?: StringNullableFilter<"Deposit"> | string | null
    stripeCustomerId?: StringNullableFilter<"Deposit"> | string | null
    heldAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    appliedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    refundedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    forfeitedAt?: DateTimeNullableFilter<"Deposit"> | Date | string | null
    createdAt?: DateTimeFilter<"Deposit"> | Date | string
    updatedAt?: DateTimeFilter<"Deposit"> | Date | string
    reservation?: XOR<ReservationScalarRelationFilter, ReservationWhereInput>
  }, "id" | "reservationId">

  export type DepositOrderByWithAggregationInput = {
    id?: SortOrder
    reservationId?: SortOrder
    amountCents?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    stripePaymentIntentId?: SortOrderInput | SortOrder
    stripeCustomerId?: SortOrderInput | SortOrder
    heldAt?: SortOrderInput | SortOrder
    appliedAt?: SortOrderInput | SortOrder
    refundedAt?: SortOrderInput | SortOrder
    forfeitedAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: DepositCountOrderByAggregateInput
    _avg?: DepositAvgOrderByAggregateInput
    _max?: DepositMaxOrderByAggregateInput
    _min?: DepositMinOrderByAggregateInput
    _sum?: DepositSumOrderByAggregateInput
  }

  export type DepositScalarWhereWithAggregatesInput = {
    AND?: DepositScalarWhereWithAggregatesInput | DepositScalarWhereWithAggregatesInput[]
    OR?: DepositScalarWhereWithAggregatesInput[]
    NOT?: DepositScalarWhereWithAggregatesInput | DepositScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"Deposit"> | string
    reservationId?: StringWithAggregatesFilter<"Deposit"> | string
    amountCents?: IntWithAggregatesFilter<"Deposit"> | number
    currency?: StringWithAggregatesFilter<"Deposit"> | string
    status?: EnumDepositStatusWithAggregatesFilter<"Deposit"> | $Enums.DepositStatus
    stripePaymentIntentId?: StringNullableWithAggregatesFilter<"Deposit"> | string | null
    stripeCustomerId?: StringNullableWithAggregatesFilter<"Deposit"> | string | null
    heldAt?: DateTimeNullableWithAggregatesFilter<"Deposit"> | Date | string | null
    appliedAt?: DateTimeNullableWithAggregatesFilter<"Deposit"> | Date | string | null
    refundedAt?: DateTimeNullableWithAggregatesFilter<"Deposit"> | Date | string | null
    forfeitedAt?: DateTimeNullableWithAggregatesFilter<"Deposit"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"Deposit"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"Deposit"> | Date | string
  }

  export type WaitlistEntryWhereInput = {
    AND?: WaitlistEntryWhereInput | WaitlistEntryWhereInput[]
    OR?: WaitlistEntryWhereInput[]
    NOT?: WaitlistEntryWhereInput | WaitlistEntryWhereInput[]
    id?: StringFilter<"WaitlistEntry"> | string
    venueId?: StringFilter<"WaitlistEntry"> | string
    partySize?: IntFilter<"WaitlistEntry"> | number
    guestName?: StringFilter<"WaitlistEntry"> | string
    guestPhone?: StringFilter<"WaitlistEntry"> | string
    position?: IntFilter<"WaitlistEntry"> | number
    estimatedWaitMinutes?: IntFilter<"WaitlistEntry"> | number
    status?: EnumWaitlistStatusFilter<"WaitlistEntry"> | $Enums.WaitlistStatus
    notifiedAt?: DateTimeNullableFilter<"WaitlistEntry"> | Date | string | null
    expiresAt?: DateTimeNullableFilter<"WaitlistEntry"> | Date | string | null
    createdAt?: DateTimeFilter<"WaitlistEntry"> | Date | string
    updatedAt?: DateTimeFilter<"WaitlistEntry"> | Date | string
  }

  export type WaitlistEntryOrderByWithRelationInput = {
    id?: SortOrder
    venueId?: SortOrder
    partySize?: SortOrder
    guestName?: SortOrder
    guestPhone?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
    status?: SortOrder
    notifiedAt?: SortOrderInput | SortOrder
    expiresAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WaitlistEntryWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: WaitlistEntryWhereInput | WaitlistEntryWhereInput[]
    OR?: WaitlistEntryWhereInput[]
    NOT?: WaitlistEntryWhereInput | WaitlistEntryWhereInput[]
    venueId?: StringFilter<"WaitlistEntry"> | string
    partySize?: IntFilter<"WaitlistEntry"> | number
    guestName?: StringFilter<"WaitlistEntry"> | string
    guestPhone?: StringFilter<"WaitlistEntry"> | string
    position?: IntFilter<"WaitlistEntry"> | number
    estimatedWaitMinutes?: IntFilter<"WaitlistEntry"> | number
    status?: EnumWaitlistStatusFilter<"WaitlistEntry"> | $Enums.WaitlistStatus
    notifiedAt?: DateTimeNullableFilter<"WaitlistEntry"> | Date | string | null
    expiresAt?: DateTimeNullableFilter<"WaitlistEntry"> | Date | string | null
    createdAt?: DateTimeFilter<"WaitlistEntry"> | Date | string
    updatedAt?: DateTimeFilter<"WaitlistEntry"> | Date | string
  }, "id">

  export type WaitlistEntryOrderByWithAggregationInput = {
    id?: SortOrder
    venueId?: SortOrder
    partySize?: SortOrder
    guestName?: SortOrder
    guestPhone?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
    status?: SortOrder
    notifiedAt?: SortOrderInput | SortOrder
    expiresAt?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WaitlistEntryCountOrderByAggregateInput
    _avg?: WaitlistEntryAvgOrderByAggregateInput
    _max?: WaitlistEntryMaxOrderByAggregateInput
    _min?: WaitlistEntryMinOrderByAggregateInput
    _sum?: WaitlistEntrySumOrderByAggregateInput
  }

  export type WaitlistEntryScalarWhereWithAggregatesInput = {
    AND?: WaitlistEntryScalarWhereWithAggregatesInput | WaitlistEntryScalarWhereWithAggregatesInput[]
    OR?: WaitlistEntryScalarWhereWithAggregatesInput[]
    NOT?: WaitlistEntryScalarWhereWithAggregatesInput | WaitlistEntryScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"WaitlistEntry"> | string
    venueId?: StringWithAggregatesFilter<"WaitlistEntry"> | string
    partySize?: IntWithAggregatesFilter<"WaitlistEntry"> | number
    guestName?: StringWithAggregatesFilter<"WaitlistEntry"> | string
    guestPhone?: StringWithAggregatesFilter<"WaitlistEntry"> | string
    position?: IntWithAggregatesFilter<"WaitlistEntry"> | number
    estimatedWaitMinutes?: IntWithAggregatesFilter<"WaitlistEntry"> | number
    status?: EnumWaitlistStatusWithAggregatesFilter<"WaitlistEntry"> | $Enums.WaitlistStatus
    notifiedAt?: DateTimeNullableWithAggregatesFilter<"WaitlistEntry"> | Date | string | null
    expiresAt?: DateTimeNullableWithAggregatesFilter<"WaitlistEntry"> | Date | string | null
    createdAt?: DateTimeWithAggregatesFilter<"WaitlistEntry"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"WaitlistEntry"> | Date | string
  }

  export type ReservationHoldWhereInput = {
    AND?: ReservationHoldWhereInput | ReservationHoldWhereInput[]
    OR?: ReservationHoldWhereInput[]
    NOT?: ReservationHoldWhereInput | ReservationHoldWhereInput[]
    id?: StringFilter<"ReservationHold"> | string
    venueId?: StringFilter<"ReservationHold"> | string
    tableId?: StringFilter<"ReservationHold"> | string
    date?: DateTimeFilter<"ReservationHold"> | Date | string
    startTime?: DateTimeFilter<"ReservationHold"> | Date | string
    endTime?: DateTimeFilter<"ReservationHold"> | Date | string
    partySize?: IntFilter<"ReservationHold"> | number
    sessionId?: StringFilter<"ReservationHold"> | string
    expiresAt?: DateTimeFilter<"ReservationHold"> | Date | string
    createdAt?: DateTimeFilter<"ReservationHold"> | Date | string
    venue?: XOR<VenueScalarRelationFilter, VenueWhereInput>
    table?: XOR<TableScalarRelationFilter, TableWhereInput>
  }

  export type ReservationHoldOrderByWithRelationInput = {
    id?: SortOrder
    venueId?: SortOrder
    tableId?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    sessionId?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
    venue?: VenueOrderByWithRelationInput
    table?: TableOrderByWithRelationInput
  }

  export type ReservationHoldWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    AND?: ReservationHoldWhereInput | ReservationHoldWhereInput[]
    OR?: ReservationHoldWhereInput[]
    NOT?: ReservationHoldWhereInput | ReservationHoldWhereInput[]
    venueId?: StringFilter<"ReservationHold"> | string
    tableId?: StringFilter<"ReservationHold"> | string
    date?: DateTimeFilter<"ReservationHold"> | Date | string
    startTime?: DateTimeFilter<"ReservationHold"> | Date | string
    endTime?: DateTimeFilter<"ReservationHold"> | Date | string
    partySize?: IntFilter<"ReservationHold"> | number
    sessionId?: StringFilter<"ReservationHold"> | string
    expiresAt?: DateTimeFilter<"ReservationHold"> | Date | string
    createdAt?: DateTimeFilter<"ReservationHold"> | Date | string
    venue?: XOR<VenueScalarRelationFilter, VenueWhereInput>
    table?: XOR<TableScalarRelationFilter, TableWhereInput>
  }, "id">

  export type ReservationHoldOrderByWithAggregationInput = {
    id?: SortOrder
    venueId?: SortOrder
    tableId?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    sessionId?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
    _count?: ReservationHoldCountOrderByAggregateInput
    _avg?: ReservationHoldAvgOrderByAggregateInput
    _max?: ReservationHoldMaxOrderByAggregateInput
    _min?: ReservationHoldMinOrderByAggregateInput
    _sum?: ReservationHoldSumOrderByAggregateInput
  }

  export type ReservationHoldScalarWhereWithAggregatesInput = {
    AND?: ReservationHoldScalarWhereWithAggregatesInput | ReservationHoldScalarWhereWithAggregatesInput[]
    OR?: ReservationHoldScalarWhereWithAggregatesInput[]
    NOT?: ReservationHoldScalarWhereWithAggregatesInput | ReservationHoldScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"ReservationHold"> | string
    venueId?: StringWithAggregatesFilter<"ReservationHold"> | string
    tableId?: StringWithAggregatesFilter<"ReservationHold"> | string
    date?: DateTimeWithAggregatesFilter<"ReservationHold"> | Date | string
    startTime?: DateTimeWithAggregatesFilter<"ReservationHold"> | Date | string
    endTime?: DateTimeWithAggregatesFilter<"ReservationHold"> | Date | string
    partySize?: IntWithAggregatesFilter<"ReservationHold"> | number
    sessionId?: StringWithAggregatesFilter<"ReservationHold"> | string
    expiresAt?: DateTimeWithAggregatesFilter<"ReservationHold"> | Date | string
    createdAt?: DateTimeWithAggregatesFilter<"ReservationHold"> | Date | string
  }

  export type VenueGroupCreateInput = {
    id?: string
    name: string
    slug: string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    venues?: VenueCreateNestedManyWithoutVenueGroupInput
  }

  export type VenueGroupUncheckedCreateInput = {
    id?: string
    name: string
    slug: string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    venues?: VenueUncheckedCreateNestedManyWithoutVenueGroupInput
  }

  export type VenueGroupUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venues?: VenueUpdateManyWithoutVenueGroupNestedInput
  }

  export type VenueGroupUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venues?: VenueUncheckedUpdateManyWithoutVenueGroupNestedInput
  }

  export type VenueGroupCreateManyInput = {
    id?: string
    name: string
    slug: string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type VenueGroupUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VenueGroupUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VenueCreateInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venueGroup?: VenueGroupCreateNestedOneWithoutVenuesInput
    tables?: TableCreateNestedManyWithoutVenueInput
    reservations?: ReservationCreateNestedManyWithoutVenueInput
    guests?: GuestCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutVenueInput
    reservations?: ReservationUncheckedCreateNestedManyWithoutVenueInput
    guests?: GuestUncheckedCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanUncheckedCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venueGroup?: VenueGroupUpdateOneWithoutVenuesNestedInput
    tables?: TableUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUpdateManyWithoutVenueNestedInput
    guests?: GuestUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUncheckedUpdateManyWithoutVenueNestedInput
    guests?: GuestUncheckedUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUncheckedUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type VenueCreateManyInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VenueUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VenueUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FloorPlanCreateInput = {
    id?: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    venue: VenueCreateNestedOneWithoutFloorPlansInput
    tables?: TableCreateNestedManyWithoutFloorPlanInput
  }

  export type FloorPlanUncheckedCreateInput = {
    id?: string
    venueId: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutFloorPlanInput
  }

  export type FloorPlanUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneRequiredWithoutFloorPlansNestedInput
    tables?: TableUpdateManyWithoutFloorPlanNestedInput
  }

  export type FloorPlanUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutFloorPlanNestedInput
  }

  export type FloorPlanCreateManyInput = {
    id?: string
    venueId: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FloorPlanUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FloorPlanUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TableCreateInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    venue?: VenueCreateNestedOneWithoutTablesInput
    floorPlan?: FloorPlanCreateNestedOneWithoutTablesInput
    reservations?: ReservationCreateNestedManyWithoutTableInput
    holds?: ReservationHoldCreateNestedManyWithoutTableInput
  }

  export type TableUncheckedCreateInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    venueId?: string | null
    floorPlanId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutTableInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutTableInput
  }

  export type TableUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneWithoutTablesNestedInput
    floorPlan?: FloorPlanUpdateOneWithoutTablesNestedInput
    reservations?: ReservationUpdateManyWithoutTableNestedInput
    holds?: ReservationHoldUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    floorPlanId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutTableNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutTableNestedInput
  }

  export type TableCreateManyInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    venueId?: string | null
    floorPlanId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TableUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TableUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    floorPlanId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GuestCreateInput = {
    id?: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venue: VenueCreateNestedOneWithoutGuestsInput
    reservations?: ReservationCreateNestedManyWithoutGuestInput
  }

  export type GuestUncheckedCreateInput = {
    id?: string
    venueId: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutGuestInput
  }

  export type GuestUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneRequiredWithoutGuestsNestedInput
    reservations?: ReservationUpdateManyWithoutGuestNestedInput
  }

  export type GuestUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutGuestNestedInput
  }

  export type GuestCreateManyInput = {
    id?: string
    venueId: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GuestUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GuestUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationCreateInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    guest?: GuestCreateNestedOneWithoutReservationsInput
    table: TableCreateNestedOneWithoutReservationsInput
    venue?: VenueCreateNestedOneWithoutReservationsInput
    deposit?: DepositCreateNestedOneWithoutReservationInput
  }

  export type ReservationUncheckedCreateInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    tableId: string
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    deposit?: DepositUncheckedCreateNestedOneWithoutReservationInput
  }

  export type ReservationUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    guest?: GuestUpdateOneWithoutReservationsNestedInput
    table?: TableUpdateOneRequiredWithoutReservationsNestedInput
    venue?: VenueUpdateOneWithoutReservationsNestedInput
    deposit?: DepositUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deposit?: DepositUncheckedUpdateOneWithoutReservationNestedInput
  }

  export type ReservationCreateManyInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    tableId: string
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ReservationUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DepositCreateInput = {
    id?: string
    amountCents: number
    currency?: string
    status?: $Enums.DepositStatus
    stripePaymentIntentId?: string | null
    stripeCustomerId?: string | null
    heldAt?: Date | string | null
    appliedAt?: Date | string | null
    refundedAt?: Date | string | null
    forfeitedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    reservation: ReservationCreateNestedOneWithoutDepositInput
  }

  export type DepositUncheckedCreateInput = {
    id?: string
    reservationId: string
    amountCents: number
    currency?: string
    status?: $Enums.DepositStatus
    stripePaymentIntentId?: string | null
    stripeCustomerId?: string | null
    heldAt?: Date | string | null
    appliedAt?: Date | string | null
    refundedAt?: Date | string | null
    forfeitedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type DepositUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    amountCents?: IntFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    stripePaymentIntentId?: NullableStringFieldUpdateOperationsInput | string | null
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    heldAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    appliedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    refundedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    forfeitedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservation?: ReservationUpdateOneRequiredWithoutDepositNestedInput
  }

  export type DepositUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    reservationId?: StringFieldUpdateOperationsInput | string
    amountCents?: IntFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    stripePaymentIntentId?: NullableStringFieldUpdateOperationsInput | string | null
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    heldAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    appliedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    refundedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    forfeitedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DepositCreateManyInput = {
    id?: string
    reservationId: string
    amountCents: number
    currency?: string
    status?: $Enums.DepositStatus
    stripePaymentIntentId?: string | null
    stripeCustomerId?: string | null
    heldAt?: Date | string | null
    appliedAt?: Date | string | null
    refundedAt?: Date | string | null
    forfeitedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type DepositUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    amountCents?: IntFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    stripePaymentIntentId?: NullableStringFieldUpdateOperationsInput | string | null
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    heldAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    appliedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    refundedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    forfeitedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DepositUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    reservationId?: StringFieldUpdateOperationsInput | string
    amountCents?: IntFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    stripePaymentIntentId?: NullableStringFieldUpdateOperationsInput | string | null
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    heldAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    appliedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    refundedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    forfeitedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WaitlistEntryCreateInput = {
    id?: string
    venueId: string
    partySize: number
    guestName: string
    guestPhone: string
    position: number
    estimatedWaitMinutes: number
    status?: $Enums.WaitlistStatus
    notifiedAt?: Date | string | null
    expiresAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WaitlistEntryUncheckedCreateInput = {
    id?: string
    venueId: string
    partySize: number
    guestName: string
    guestPhone: string
    position: number
    estimatedWaitMinutes: number
    status?: $Enums.WaitlistStatus
    notifiedAt?: Date | string | null
    expiresAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WaitlistEntryUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    partySize?: IntFieldUpdateOperationsInput | number
    guestName?: StringFieldUpdateOperationsInput | string
    guestPhone?: StringFieldUpdateOperationsInput | string
    position?: IntFieldUpdateOperationsInput | number
    estimatedWaitMinutes?: IntFieldUpdateOperationsInput | number
    status?: EnumWaitlistStatusFieldUpdateOperationsInput | $Enums.WaitlistStatus
    notifiedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WaitlistEntryUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    partySize?: IntFieldUpdateOperationsInput | number
    guestName?: StringFieldUpdateOperationsInput | string
    guestPhone?: StringFieldUpdateOperationsInput | string
    position?: IntFieldUpdateOperationsInput | number
    estimatedWaitMinutes?: IntFieldUpdateOperationsInput | number
    status?: EnumWaitlistStatusFieldUpdateOperationsInput | $Enums.WaitlistStatus
    notifiedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WaitlistEntryCreateManyInput = {
    id?: string
    venueId: string
    partySize: number
    guestName: string
    guestPhone: string
    position: number
    estimatedWaitMinutes: number
    status?: $Enums.WaitlistStatus
    notifiedAt?: Date | string | null
    expiresAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WaitlistEntryUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    partySize?: IntFieldUpdateOperationsInput | number
    guestName?: StringFieldUpdateOperationsInput | string
    guestPhone?: StringFieldUpdateOperationsInput | string
    position?: IntFieldUpdateOperationsInput | number
    estimatedWaitMinutes?: IntFieldUpdateOperationsInput | number
    status?: EnumWaitlistStatusFieldUpdateOperationsInput | $Enums.WaitlistStatus
    notifiedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WaitlistEntryUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    partySize?: IntFieldUpdateOperationsInput | number
    guestName?: StringFieldUpdateOperationsInput | string
    guestPhone?: StringFieldUpdateOperationsInput | string
    position?: IntFieldUpdateOperationsInput | number
    estimatedWaitMinutes?: IntFieldUpdateOperationsInput | number
    status?: EnumWaitlistStatusFieldUpdateOperationsInput | $Enums.WaitlistStatus
    notifiedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    expiresAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldCreateInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
    venue: VenueCreateNestedOneWithoutHoldsInput
    table: TableCreateNestedOneWithoutHoldsInput
  }

  export type ReservationHoldUncheckedCreateInput = {
    id?: string
    venueId: string
    tableId: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
  }

  export type ReservationHoldUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneRequiredWithoutHoldsNestedInput
    table?: TableUpdateOneRequiredWithoutHoldsNestedInput
  }

  export type ReservationHoldUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldCreateManyInput = {
    id?: string
    venueId: string
    tableId: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
  }

  export type ReservationHoldUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }
  export type JsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type VenueListRelationFilter = {
    every?: VenueWhereInput
    some?: VenueWhereInput
    none?: VenueWhereInput
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type VenueOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type VenueGroupCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    settings?: SortOrder
    createdAt?: SortOrder
  }

  export type VenueGroupMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
  }

  export type VenueGroupMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    createdAt?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }
  export type JsonNullableWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonNullableWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonNullableWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedJsonNullableFilter<$PrismaModel>
    _max?: NestedJsonNullableFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type EnumDepositTypeNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDepositTypeNullableFilter<$PrismaModel> | $Enums.DepositType | null
  }

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type VenueGroupNullableScalarRelationFilter = {
    is?: VenueGroupWhereInput | null
    isNot?: VenueGroupWhereInput | null
  }

  export type TableListRelationFilter = {
    every?: TableWhereInput
    some?: TableWhereInput
    none?: TableWhereInput
  }

  export type ReservationListRelationFilter = {
    every?: ReservationWhereInput
    some?: ReservationWhereInput
    none?: ReservationWhereInput
  }

  export type GuestListRelationFilter = {
    every?: GuestWhereInput
    some?: GuestWhereInput
    none?: GuestWhereInput
  }

  export type FloorPlanListRelationFilter = {
    every?: FloorPlanWhereInput
    some?: FloorPlanWhereInput
    none?: FloorPlanWhereInput
  }

  export type ReservationHoldListRelationFilter = {
    every?: ReservationHoldWhereInput
    some?: ReservationHoldWhereInput
    none?: ReservationHoldWhereInput
  }

  export type TableOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ReservationOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type GuestOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type FloorPlanOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type ReservationHoldOrderByRelationAggregateInput = {
    _count?: SortOrder
  }

  export type VenueVenueGroupIdSlugCompoundUniqueInput = {
    venueGroupId: string
    slug: string
  }

  export type VenueCountOrderByAggregateInput = {
    id?: SortOrder
    venueGroupId?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    ianaTimezone?: SortOrder
    currencyCode?: SortOrder
    operatingHours?: SortOrder
    settings?: SortOrder
    depositEnabled?: SortOrder
    depositType?: SortOrder
    depositAmountCents?: SortOrder
    freeCancellationHours?: SortOrder
    lateCancellationFeePercent?: SortOrder
    noShowFeePercent?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VenueAvgOrderByAggregateInput = {
    depositAmountCents?: SortOrder
    freeCancellationHours?: SortOrder
    lateCancellationFeePercent?: SortOrder
    noShowFeePercent?: SortOrder
  }

  export type VenueMaxOrderByAggregateInput = {
    id?: SortOrder
    venueGroupId?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    ianaTimezone?: SortOrder
    currencyCode?: SortOrder
    depositEnabled?: SortOrder
    depositType?: SortOrder
    depositAmountCents?: SortOrder
    freeCancellationHours?: SortOrder
    lateCancellationFeePercent?: SortOrder
    noShowFeePercent?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VenueMinOrderByAggregateInput = {
    id?: SortOrder
    venueGroupId?: SortOrder
    name?: SortOrder
    slug?: SortOrder
    ianaTimezone?: SortOrder
    currencyCode?: SortOrder
    depositEnabled?: SortOrder
    depositType?: SortOrder
    depositAmountCents?: SortOrder
    freeCancellationHours?: SortOrder
    lateCancellationFeePercent?: SortOrder
    noShowFeePercent?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type VenueSumOrderByAggregateInput = {
    depositAmountCents?: SortOrder
    freeCancellationHours?: SortOrder
    lateCancellationFeePercent?: SortOrder
    noShowFeePercent?: SortOrder
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type EnumDepositTypeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDepositTypeNullableWithAggregatesFilter<$PrismaModel> | $Enums.DepositType | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumDepositTypeNullableFilter<$PrismaModel>
    _max?: NestedEnumDepositTypeNullableFilter<$PrismaModel>
  }

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, 'path'>>

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type VenueScalarRelationFilter = {
    is?: VenueWhereInput
    isNot?: VenueWhereInput
  }

  export type FloorPlanCountOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    layoutJson?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type FloorPlanMaxOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type FloorPlanMinOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    name?: SortOrder
    isActive?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, 'path'>>

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedJsonFilter<$PrismaModel>
    _max?: NestedJsonFilter<$PrismaModel>
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type EnumTableStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.TableStatus | EnumTableStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTableStatusFilter<$PrismaModel> | $Enums.TableStatus
  }

  export type VenueNullableScalarRelationFilter = {
    is?: VenueWhereInput | null
    isNot?: VenueWhereInput | null
  }

  export type FloorPlanNullableScalarRelationFilter = {
    is?: FloorPlanWhereInput | null
    isNot?: FloorPlanWhereInput | null
  }

  export type TableVenueIdNameCompoundUniqueInput = {
    venueId: string
    name: string
  }

  export type TableCountOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    tableNumber?: SortOrder
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrder
    location?: SortOrder
    isActive?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    venueId?: SortOrder
    floorPlanId?: SortOrder
    shapeMetadata?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TableAvgOrderByAggregateInput = {
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrder
    priority?: SortOrder
  }

  export type TableMaxOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    tableNumber?: SortOrder
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrder
    location?: SortOrder
    isActive?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    venueId?: SortOrder
    floorPlanId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TableMinOrderByAggregateInput = {
    id?: SortOrder
    name?: SortOrder
    tableNumber?: SortOrder
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrder
    location?: SortOrder
    isActive?: SortOrder
    status?: SortOrder
    priority?: SortOrder
    venueId?: SortOrder
    floorPlanId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type TableSumOrderByAggregateInput = {
    capacity?: SortOrder
    minCovers?: SortOrder
    maxCovers?: SortOrder
    priority?: SortOrder
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type EnumTableStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TableStatus | EnumTableStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTableStatusWithAggregatesFilter<$PrismaModel> | $Enums.TableStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTableStatusFilter<$PrismaModel>
    _max?: NestedEnumTableStatusFilter<$PrismaModel>
  }

  export type DecimalNullableFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
  }

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type EnumCommunicationPreferenceFilter<$PrismaModel = never> = {
    equals?: $Enums.CommunicationPreference | EnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumCommunicationPreferenceFilter<$PrismaModel> | $Enums.CommunicationPreference
  }

  export type GuestVenueIdEmailCompoundUniqueInput = {
    venueId: string
    email: string
  }

  export type GuestVenueIdPhoneCompoundUniqueInput = {
    venueId: string
    phone: string
  }

  export type GuestCountOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    name?: SortOrder
    notes?: SortOrder
    visitCount?: SortOrder
    lifetimeSpend?: SortOrder
    lastVisit?: SortOrder
    tags?: SortOrder
    dietaryRestrictions?: SortOrder
    staffNotes?: SortOrder
    communicationPreference?: SortOrder
    stripeCustomerId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GuestAvgOrderByAggregateInput = {
    visitCount?: SortOrder
    lifetimeSpend?: SortOrder
  }

  export type GuestMaxOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    name?: SortOrder
    notes?: SortOrder
    visitCount?: SortOrder
    lifetimeSpend?: SortOrder
    lastVisit?: SortOrder
    communicationPreference?: SortOrder
    stripeCustomerId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GuestMinOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    email?: SortOrder
    phone?: SortOrder
    name?: SortOrder
    notes?: SortOrder
    visitCount?: SortOrder
    lifetimeSpend?: SortOrder
    lastVisit?: SortOrder
    communicationPreference?: SortOrder
    stripeCustomerId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type GuestSumOrderByAggregateInput = {
    visitCount?: SortOrder
    lifetimeSpend?: SortOrder
  }

  export type DecimalNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedDecimalNullableFilter<$PrismaModel>
    _sum?: NestedDecimalNullableFilter<$PrismaModel>
    _min?: NestedDecimalNullableFilter<$PrismaModel>
    _max?: NestedDecimalNullableFilter<$PrismaModel>
  }

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type EnumCommunicationPreferenceWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.CommunicationPreference | EnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumCommunicationPreferenceWithAggregatesFilter<$PrismaModel> | $Enums.CommunicationPreference
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumCommunicationPreferenceFilter<$PrismaModel>
    _max?: NestedEnumCommunicationPreferenceFilter<$PrismaModel>
  }

  export type EnumReservationStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.ReservationStatus | EnumReservationStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumReservationStatusFilter<$PrismaModel> | $Enums.ReservationStatus
  }

  export type EnumOccasionNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.Occasion | EnumOccasionFieldRefInput<$PrismaModel> | null
    in?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    not?: NestedEnumOccasionNullableFilter<$PrismaModel> | $Enums.Occasion | null
  }

  export type EnumSeatingPreferenceNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.SeatingPreference | EnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    in?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    not?: NestedEnumSeatingPreferenceNullableFilter<$PrismaModel> | $Enums.SeatingPreference | null
  }

  export type GuestNullableScalarRelationFilter = {
    is?: GuestWhereInput | null
    isNot?: GuestWhereInput | null
  }

  export type TableScalarRelationFilter = {
    is?: TableWhereInput
    isNot?: TableWhereInput
  }

  export type DepositNullableScalarRelationFilter = {
    is?: DepositWhereInput | null
    isNot?: DepositWhereInput | null
  }

  export type ReservationCountOrderByAggregateInput = {
    id?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    status?: SortOrder
    notes?: SortOrder
    cancellationReason?: SortOrder
    cancellationNote?: SortOrder
    occasion?: SortOrder
    seatingPreference?: SortOrder
    guestName?: SortOrder
    guestEmail?: SortOrder
    guestPhone?: SortOrder
    guestId?: SortOrder
    userId?: SortOrder
    tableId?: SortOrder
    venueId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ReservationAvgOrderByAggregateInput = {
    partySize?: SortOrder
  }

  export type ReservationMaxOrderByAggregateInput = {
    id?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    status?: SortOrder
    notes?: SortOrder
    cancellationReason?: SortOrder
    cancellationNote?: SortOrder
    occasion?: SortOrder
    seatingPreference?: SortOrder
    guestName?: SortOrder
    guestEmail?: SortOrder
    guestPhone?: SortOrder
    guestId?: SortOrder
    userId?: SortOrder
    tableId?: SortOrder
    venueId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ReservationMinOrderByAggregateInput = {
    id?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    status?: SortOrder
    notes?: SortOrder
    cancellationReason?: SortOrder
    cancellationNote?: SortOrder
    occasion?: SortOrder
    seatingPreference?: SortOrder
    guestName?: SortOrder
    guestEmail?: SortOrder
    guestPhone?: SortOrder
    guestId?: SortOrder
    userId?: SortOrder
    tableId?: SortOrder
    venueId?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type ReservationSumOrderByAggregateInput = {
    partySize?: SortOrder
  }

  export type EnumReservationStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ReservationStatus | EnumReservationStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumReservationStatusWithAggregatesFilter<$PrismaModel> | $Enums.ReservationStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumReservationStatusFilter<$PrismaModel>
    _max?: NestedEnumReservationStatusFilter<$PrismaModel>
  }

  export type EnumOccasionNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.Occasion | EnumOccasionFieldRefInput<$PrismaModel> | null
    in?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    not?: NestedEnumOccasionNullableWithAggregatesFilter<$PrismaModel> | $Enums.Occasion | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumOccasionNullableFilter<$PrismaModel>
    _max?: NestedEnumOccasionNullableFilter<$PrismaModel>
  }

  export type EnumSeatingPreferenceNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SeatingPreference | EnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    in?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    not?: NestedEnumSeatingPreferenceNullableWithAggregatesFilter<$PrismaModel> | $Enums.SeatingPreference | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumSeatingPreferenceNullableFilter<$PrismaModel>
    _max?: NestedEnumSeatingPreferenceNullableFilter<$PrismaModel>
  }

  export type EnumDepositStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusFilter<$PrismaModel> | $Enums.DepositStatus
  }

  export type ReservationScalarRelationFilter = {
    is?: ReservationWhereInput
    isNot?: ReservationWhereInput
  }

  export type DepositCountOrderByAggregateInput = {
    id?: SortOrder
    reservationId?: SortOrder
    amountCents?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    stripePaymentIntentId?: SortOrder
    stripeCustomerId?: SortOrder
    heldAt?: SortOrder
    appliedAt?: SortOrder
    refundedAt?: SortOrder
    forfeitedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DepositAvgOrderByAggregateInput = {
    amountCents?: SortOrder
  }

  export type DepositMaxOrderByAggregateInput = {
    id?: SortOrder
    reservationId?: SortOrder
    amountCents?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    stripePaymentIntentId?: SortOrder
    stripeCustomerId?: SortOrder
    heldAt?: SortOrder
    appliedAt?: SortOrder
    refundedAt?: SortOrder
    forfeitedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DepositMinOrderByAggregateInput = {
    id?: SortOrder
    reservationId?: SortOrder
    amountCents?: SortOrder
    currency?: SortOrder
    status?: SortOrder
    stripePaymentIntentId?: SortOrder
    stripeCustomerId?: SortOrder
    heldAt?: SortOrder
    appliedAt?: SortOrder
    refundedAt?: SortOrder
    forfeitedAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type DepositSumOrderByAggregateInput = {
    amountCents?: SortOrder
  }

  export type EnumDepositStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusWithAggregatesFilter<$PrismaModel> | $Enums.DepositStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDepositStatusFilter<$PrismaModel>
    _max?: NestedEnumDepositStatusFilter<$PrismaModel>
  }

  export type EnumWaitlistStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.WaitlistStatus | EnumWaitlistStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWaitlistStatusFilter<$PrismaModel> | $Enums.WaitlistStatus
  }

  export type WaitlistEntryCountOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    partySize?: SortOrder
    guestName?: SortOrder
    guestPhone?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
    status?: SortOrder
    notifiedAt?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WaitlistEntryAvgOrderByAggregateInput = {
    partySize?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
  }

  export type WaitlistEntryMaxOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    partySize?: SortOrder
    guestName?: SortOrder
    guestPhone?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
    status?: SortOrder
    notifiedAt?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WaitlistEntryMinOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    partySize?: SortOrder
    guestName?: SortOrder
    guestPhone?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
    status?: SortOrder
    notifiedAt?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WaitlistEntrySumOrderByAggregateInput = {
    partySize?: SortOrder
    position?: SortOrder
    estimatedWaitMinutes?: SortOrder
  }

  export type EnumWaitlistStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.WaitlistStatus | EnumWaitlistStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWaitlistStatusWithAggregatesFilter<$PrismaModel> | $Enums.WaitlistStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumWaitlistStatusFilter<$PrismaModel>
    _max?: NestedEnumWaitlistStatusFilter<$PrismaModel>
  }

  export type ReservationHoldCountOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    tableId?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    sessionId?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
  }

  export type ReservationHoldAvgOrderByAggregateInput = {
    partySize?: SortOrder
  }

  export type ReservationHoldMaxOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    tableId?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    sessionId?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
  }

  export type ReservationHoldMinOrderByAggregateInput = {
    id?: SortOrder
    venueId?: SortOrder
    tableId?: SortOrder
    date?: SortOrder
    startTime?: SortOrder
    endTime?: SortOrder
    partySize?: SortOrder
    sessionId?: SortOrder
    expiresAt?: SortOrder
    createdAt?: SortOrder
  }

  export type ReservationHoldSumOrderByAggregateInput = {
    partySize?: SortOrder
  }

  export type VenueCreateNestedManyWithoutVenueGroupInput = {
    create?: XOR<VenueCreateWithoutVenueGroupInput, VenueUncheckedCreateWithoutVenueGroupInput> | VenueCreateWithoutVenueGroupInput[] | VenueUncheckedCreateWithoutVenueGroupInput[]
    connectOrCreate?: VenueCreateOrConnectWithoutVenueGroupInput | VenueCreateOrConnectWithoutVenueGroupInput[]
    createMany?: VenueCreateManyVenueGroupInputEnvelope
    connect?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
  }

  export type VenueUncheckedCreateNestedManyWithoutVenueGroupInput = {
    create?: XOR<VenueCreateWithoutVenueGroupInput, VenueUncheckedCreateWithoutVenueGroupInput> | VenueCreateWithoutVenueGroupInput[] | VenueUncheckedCreateWithoutVenueGroupInput[]
    connectOrCreate?: VenueCreateOrConnectWithoutVenueGroupInput | VenueCreateOrConnectWithoutVenueGroupInput[]
    createMany?: VenueCreateManyVenueGroupInputEnvelope
    connect?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type VenueUpdateManyWithoutVenueGroupNestedInput = {
    create?: XOR<VenueCreateWithoutVenueGroupInput, VenueUncheckedCreateWithoutVenueGroupInput> | VenueCreateWithoutVenueGroupInput[] | VenueUncheckedCreateWithoutVenueGroupInput[]
    connectOrCreate?: VenueCreateOrConnectWithoutVenueGroupInput | VenueCreateOrConnectWithoutVenueGroupInput[]
    upsert?: VenueUpsertWithWhereUniqueWithoutVenueGroupInput | VenueUpsertWithWhereUniqueWithoutVenueGroupInput[]
    createMany?: VenueCreateManyVenueGroupInputEnvelope
    set?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    disconnect?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    delete?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    connect?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    update?: VenueUpdateWithWhereUniqueWithoutVenueGroupInput | VenueUpdateWithWhereUniqueWithoutVenueGroupInput[]
    updateMany?: VenueUpdateManyWithWhereWithoutVenueGroupInput | VenueUpdateManyWithWhereWithoutVenueGroupInput[]
    deleteMany?: VenueScalarWhereInput | VenueScalarWhereInput[]
  }

  export type VenueUncheckedUpdateManyWithoutVenueGroupNestedInput = {
    create?: XOR<VenueCreateWithoutVenueGroupInput, VenueUncheckedCreateWithoutVenueGroupInput> | VenueCreateWithoutVenueGroupInput[] | VenueUncheckedCreateWithoutVenueGroupInput[]
    connectOrCreate?: VenueCreateOrConnectWithoutVenueGroupInput | VenueCreateOrConnectWithoutVenueGroupInput[]
    upsert?: VenueUpsertWithWhereUniqueWithoutVenueGroupInput | VenueUpsertWithWhereUniqueWithoutVenueGroupInput[]
    createMany?: VenueCreateManyVenueGroupInputEnvelope
    set?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    disconnect?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    delete?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    connect?: VenueWhereUniqueInput | VenueWhereUniqueInput[]
    update?: VenueUpdateWithWhereUniqueWithoutVenueGroupInput | VenueUpdateWithWhereUniqueWithoutVenueGroupInput[]
    updateMany?: VenueUpdateManyWithWhereWithoutVenueGroupInput | VenueUpdateManyWithWhereWithoutVenueGroupInput[]
    deleteMany?: VenueScalarWhereInput | VenueScalarWhereInput[]
  }

  export type VenueGroupCreateNestedOneWithoutVenuesInput = {
    create?: XOR<VenueGroupCreateWithoutVenuesInput, VenueGroupUncheckedCreateWithoutVenuesInput>
    connectOrCreate?: VenueGroupCreateOrConnectWithoutVenuesInput
    connect?: VenueGroupWhereUniqueInput
  }

  export type TableCreateNestedManyWithoutVenueInput = {
    create?: XOR<TableCreateWithoutVenueInput, TableUncheckedCreateWithoutVenueInput> | TableCreateWithoutVenueInput[] | TableUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: TableCreateOrConnectWithoutVenueInput | TableCreateOrConnectWithoutVenueInput[]
    createMany?: TableCreateManyVenueInputEnvelope
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
  }

  export type ReservationCreateNestedManyWithoutVenueInput = {
    create?: XOR<ReservationCreateWithoutVenueInput, ReservationUncheckedCreateWithoutVenueInput> | ReservationCreateWithoutVenueInput[] | ReservationUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutVenueInput | ReservationCreateOrConnectWithoutVenueInput[]
    createMany?: ReservationCreateManyVenueInputEnvelope
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
  }

  export type GuestCreateNestedManyWithoutVenueInput = {
    create?: XOR<GuestCreateWithoutVenueInput, GuestUncheckedCreateWithoutVenueInput> | GuestCreateWithoutVenueInput[] | GuestUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: GuestCreateOrConnectWithoutVenueInput | GuestCreateOrConnectWithoutVenueInput[]
    createMany?: GuestCreateManyVenueInputEnvelope
    connect?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
  }

  export type FloorPlanCreateNestedManyWithoutVenueInput = {
    create?: XOR<FloorPlanCreateWithoutVenueInput, FloorPlanUncheckedCreateWithoutVenueInput> | FloorPlanCreateWithoutVenueInput[] | FloorPlanUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: FloorPlanCreateOrConnectWithoutVenueInput | FloorPlanCreateOrConnectWithoutVenueInput[]
    createMany?: FloorPlanCreateManyVenueInputEnvelope
    connect?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
  }

  export type ReservationHoldCreateNestedManyWithoutVenueInput = {
    create?: XOR<ReservationHoldCreateWithoutVenueInput, ReservationHoldUncheckedCreateWithoutVenueInput> | ReservationHoldCreateWithoutVenueInput[] | ReservationHoldUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutVenueInput | ReservationHoldCreateOrConnectWithoutVenueInput[]
    createMany?: ReservationHoldCreateManyVenueInputEnvelope
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
  }

  export type TableUncheckedCreateNestedManyWithoutVenueInput = {
    create?: XOR<TableCreateWithoutVenueInput, TableUncheckedCreateWithoutVenueInput> | TableCreateWithoutVenueInput[] | TableUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: TableCreateOrConnectWithoutVenueInput | TableCreateOrConnectWithoutVenueInput[]
    createMany?: TableCreateManyVenueInputEnvelope
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
  }

  export type ReservationUncheckedCreateNestedManyWithoutVenueInput = {
    create?: XOR<ReservationCreateWithoutVenueInput, ReservationUncheckedCreateWithoutVenueInput> | ReservationCreateWithoutVenueInput[] | ReservationUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutVenueInput | ReservationCreateOrConnectWithoutVenueInput[]
    createMany?: ReservationCreateManyVenueInputEnvelope
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
  }

  export type GuestUncheckedCreateNestedManyWithoutVenueInput = {
    create?: XOR<GuestCreateWithoutVenueInput, GuestUncheckedCreateWithoutVenueInput> | GuestCreateWithoutVenueInput[] | GuestUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: GuestCreateOrConnectWithoutVenueInput | GuestCreateOrConnectWithoutVenueInput[]
    createMany?: GuestCreateManyVenueInputEnvelope
    connect?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
  }

  export type FloorPlanUncheckedCreateNestedManyWithoutVenueInput = {
    create?: XOR<FloorPlanCreateWithoutVenueInput, FloorPlanUncheckedCreateWithoutVenueInput> | FloorPlanCreateWithoutVenueInput[] | FloorPlanUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: FloorPlanCreateOrConnectWithoutVenueInput | FloorPlanCreateOrConnectWithoutVenueInput[]
    createMany?: FloorPlanCreateManyVenueInputEnvelope
    connect?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
  }

  export type ReservationHoldUncheckedCreateNestedManyWithoutVenueInput = {
    create?: XOR<ReservationHoldCreateWithoutVenueInput, ReservationHoldUncheckedCreateWithoutVenueInput> | ReservationHoldCreateWithoutVenueInput[] | ReservationHoldUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutVenueInput | ReservationHoldCreateOrConnectWithoutVenueInput[]
    createMany?: ReservationHoldCreateManyVenueInputEnvelope
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
  }

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean
  }

  export type NullableEnumDepositTypeFieldUpdateOperationsInput = {
    set?: $Enums.DepositType | null
  }

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type VenueGroupUpdateOneWithoutVenuesNestedInput = {
    create?: XOR<VenueGroupCreateWithoutVenuesInput, VenueGroupUncheckedCreateWithoutVenuesInput>
    connectOrCreate?: VenueGroupCreateOrConnectWithoutVenuesInput
    upsert?: VenueGroupUpsertWithoutVenuesInput
    disconnect?: VenueGroupWhereInput | boolean
    delete?: VenueGroupWhereInput | boolean
    connect?: VenueGroupWhereUniqueInput
    update?: XOR<XOR<VenueGroupUpdateToOneWithWhereWithoutVenuesInput, VenueGroupUpdateWithoutVenuesInput>, VenueGroupUncheckedUpdateWithoutVenuesInput>
  }

  export type TableUpdateManyWithoutVenueNestedInput = {
    create?: XOR<TableCreateWithoutVenueInput, TableUncheckedCreateWithoutVenueInput> | TableCreateWithoutVenueInput[] | TableUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: TableCreateOrConnectWithoutVenueInput | TableCreateOrConnectWithoutVenueInput[]
    upsert?: TableUpsertWithWhereUniqueWithoutVenueInput | TableUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: TableCreateManyVenueInputEnvelope
    set?: TableWhereUniqueInput | TableWhereUniqueInput[]
    disconnect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    delete?: TableWhereUniqueInput | TableWhereUniqueInput[]
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    update?: TableUpdateWithWhereUniqueWithoutVenueInput | TableUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: TableUpdateManyWithWhereWithoutVenueInput | TableUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: TableScalarWhereInput | TableScalarWhereInput[]
  }

  export type ReservationUpdateManyWithoutVenueNestedInput = {
    create?: XOR<ReservationCreateWithoutVenueInput, ReservationUncheckedCreateWithoutVenueInput> | ReservationCreateWithoutVenueInput[] | ReservationUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutVenueInput | ReservationCreateOrConnectWithoutVenueInput[]
    upsert?: ReservationUpsertWithWhereUniqueWithoutVenueInput | ReservationUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: ReservationCreateManyVenueInputEnvelope
    set?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    disconnect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    delete?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    update?: ReservationUpdateWithWhereUniqueWithoutVenueInput | ReservationUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: ReservationUpdateManyWithWhereWithoutVenueInput | ReservationUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
  }

  export type GuestUpdateManyWithoutVenueNestedInput = {
    create?: XOR<GuestCreateWithoutVenueInput, GuestUncheckedCreateWithoutVenueInput> | GuestCreateWithoutVenueInput[] | GuestUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: GuestCreateOrConnectWithoutVenueInput | GuestCreateOrConnectWithoutVenueInput[]
    upsert?: GuestUpsertWithWhereUniqueWithoutVenueInput | GuestUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: GuestCreateManyVenueInputEnvelope
    set?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    disconnect?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    delete?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    connect?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    update?: GuestUpdateWithWhereUniqueWithoutVenueInput | GuestUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: GuestUpdateManyWithWhereWithoutVenueInput | GuestUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: GuestScalarWhereInput | GuestScalarWhereInput[]
  }

  export type FloorPlanUpdateManyWithoutVenueNestedInput = {
    create?: XOR<FloorPlanCreateWithoutVenueInput, FloorPlanUncheckedCreateWithoutVenueInput> | FloorPlanCreateWithoutVenueInput[] | FloorPlanUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: FloorPlanCreateOrConnectWithoutVenueInput | FloorPlanCreateOrConnectWithoutVenueInput[]
    upsert?: FloorPlanUpsertWithWhereUniqueWithoutVenueInput | FloorPlanUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: FloorPlanCreateManyVenueInputEnvelope
    set?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    disconnect?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    delete?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    connect?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    update?: FloorPlanUpdateWithWhereUniqueWithoutVenueInput | FloorPlanUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: FloorPlanUpdateManyWithWhereWithoutVenueInput | FloorPlanUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: FloorPlanScalarWhereInput | FloorPlanScalarWhereInput[]
  }

  export type ReservationHoldUpdateManyWithoutVenueNestedInput = {
    create?: XOR<ReservationHoldCreateWithoutVenueInput, ReservationHoldUncheckedCreateWithoutVenueInput> | ReservationHoldCreateWithoutVenueInput[] | ReservationHoldUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutVenueInput | ReservationHoldCreateOrConnectWithoutVenueInput[]
    upsert?: ReservationHoldUpsertWithWhereUniqueWithoutVenueInput | ReservationHoldUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: ReservationHoldCreateManyVenueInputEnvelope
    set?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    disconnect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    delete?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    update?: ReservationHoldUpdateWithWhereUniqueWithoutVenueInput | ReservationHoldUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: ReservationHoldUpdateManyWithWhereWithoutVenueInput | ReservationHoldUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: ReservationHoldScalarWhereInput | ReservationHoldScalarWhereInput[]
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type TableUncheckedUpdateManyWithoutVenueNestedInput = {
    create?: XOR<TableCreateWithoutVenueInput, TableUncheckedCreateWithoutVenueInput> | TableCreateWithoutVenueInput[] | TableUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: TableCreateOrConnectWithoutVenueInput | TableCreateOrConnectWithoutVenueInput[]
    upsert?: TableUpsertWithWhereUniqueWithoutVenueInput | TableUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: TableCreateManyVenueInputEnvelope
    set?: TableWhereUniqueInput | TableWhereUniqueInput[]
    disconnect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    delete?: TableWhereUniqueInput | TableWhereUniqueInput[]
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    update?: TableUpdateWithWhereUniqueWithoutVenueInput | TableUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: TableUpdateManyWithWhereWithoutVenueInput | TableUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: TableScalarWhereInput | TableScalarWhereInput[]
  }

  export type ReservationUncheckedUpdateManyWithoutVenueNestedInput = {
    create?: XOR<ReservationCreateWithoutVenueInput, ReservationUncheckedCreateWithoutVenueInput> | ReservationCreateWithoutVenueInput[] | ReservationUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutVenueInput | ReservationCreateOrConnectWithoutVenueInput[]
    upsert?: ReservationUpsertWithWhereUniqueWithoutVenueInput | ReservationUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: ReservationCreateManyVenueInputEnvelope
    set?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    disconnect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    delete?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    update?: ReservationUpdateWithWhereUniqueWithoutVenueInput | ReservationUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: ReservationUpdateManyWithWhereWithoutVenueInput | ReservationUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
  }

  export type GuestUncheckedUpdateManyWithoutVenueNestedInput = {
    create?: XOR<GuestCreateWithoutVenueInput, GuestUncheckedCreateWithoutVenueInput> | GuestCreateWithoutVenueInput[] | GuestUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: GuestCreateOrConnectWithoutVenueInput | GuestCreateOrConnectWithoutVenueInput[]
    upsert?: GuestUpsertWithWhereUniqueWithoutVenueInput | GuestUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: GuestCreateManyVenueInputEnvelope
    set?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    disconnect?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    delete?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    connect?: GuestWhereUniqueInput | GuestWhereUniqueInput[]
    update?: GuestUpdateWithWhereUniqueWithoutVenueInput | GuestUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: GuestUpdateManyWithWhereWithoutVenueInput | GuestUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: GuestScalarWhereInput | GuestScalarWhereInput[]
  }

  export type FloorPlanUncheckedUpdateManyWithoutVenueNestedInput = {
    create?: XOR<FloorPlanCreateWithoutVenueInput, FloorPlanUncheckedCreateWithoutVenueInput> | FloorPlanCreateWithoutVenueInput[] | FloorPlanUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: FloorPlanCreateOrConnectWithoutVenueInput | FloorPlanCreateOrConnectWithoutVenueInput[]
    upsert?: FloorPlanUpsertWithWhereUniqueWithoutVenueInput | FloorPlanUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: FloorPlanCreateManyVenueInputEnvelope
    set?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    disconnect?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    delete?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    connect?: FloorPlanWhereUniqueInput | FloorPlanWhereUniqueInput[]
    update?: FloorPlanUpdateWithWhereUniqueWithoutVenueInput | FloorPlanUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: FloorPlanUpdateManyWithWhereWithoutVenueInput | FloorPlanUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: FloorPlanScalarWhereInput | FloorPlanScalarWhereInput[]
  }

  export type ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput = {
    create?: XOR<ReservationHoldCreateWithoutVenueInput, ReservationHoldUncheckedCreateWithoutVenueInput> | ReservationHoldCreateWithoutVenueInput[] | ReservationHoldUncheckedCreateWithoutVenueInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutVenueInput | ReservationHoldCreateOrConnectWithoutVenueInput[]
    upsert?: ReservationHoldUpsertWithWhereUniqueWithoutVenueInput | ReservationHoldUpsertWithWhereUniqueWithoutVenueInput[]
    createMany?: ReservationHoldCreateManyVenueInputEnvelope
    set?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    disconnect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    delete?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    update?: ReservationHoldUpdateWithWhereUniqueWithoutVenueInput | ReservationHoldUpdateWithWhereUniqueWithoutVenueInput[]
    updateMany?: ReservationHoldUpdateManyWithWhereWithoutVenueInput | ReservationHoldUpdateManyWithWhereWithoutVenueInput[]
    deleteMany?: ReservationHoldScalarWhereInput | ReservationHoldScalarWhereInput[]
  }

  export type VenueCreateNestedOneWithoutFloorPlansInput = {
    create?: XOR<VenueCreateWithoutFloorPlansInput, VenueUncheckedCreateWithoutFloorPlansInput>
    connectOrCreate?: VenueCreateOrConnectWithoutFloorPlansInput
    connect?: VenueWhereUniqueInput
  }

  export type TableCreateNestedManyWithoutFloorPlanInput = {
    create?: XOR<TableCreateWithoutFloorPlanInput, TableUncheckedCreateWithoutFloorPlanInput> | TableCreateWithoutFloorPlanInput[] | TableUncheckedCreateWithoutFloorPlanInput[]
    connectOrCreate?: TableCreateOrConnectWithoutFloorPlanInput | TableCreateOrConnectWithoutFloorPlanInput[]
    createMany?: TableCreateManyFloorPlanInputEnvelope
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
  }

  export type TableUncheckedCreateNestedManyWithoutFloorPlanInput = {
    create?: XOR<TableCreateWithoutFloorPlanInput, TableUncheckedCreateWithoutFloorPlanInput> | TableCreateWithoutFloorPlanInput[] | TableUncheckedCreateWithoutFloorPlanInput[]
    connectOrCreate?: TableCreateOrConnectWithoutFloorPlanInput | TableCreateOrConnectWithoutFloorPlanInput[]
    createMany?: TableCreateManyFloorPlanInputEnvelope
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
  }

  export type VenueUpdateOneRequiredWithoutFloorPlansNestedInput = {
    create?: XOR<VenueCreateWithoutFloorPlansInput, VenueUncheckedCreateWithoutFloorPlansInput>
    connectOrCreate?: VenueCreateOrConnectWithoutFloorPlansInput
    upsert?: VenueUpsertWithoutFloorPlansInput
    connect?: VenueWhereUniqueInput
    update?: XOR<XOR<VenueUpdateToOneWithWhereWithoutFloorPlansInput, VenueUpdateWithoutFloorPlansInput>, VenueUncheckedUpdateWithoutFloorPlansInput>
  }

  export type TableUpdateManyWithoutFloorPlanNestedInput = {
    create?: XOR<TableCreateWithoutFloorPlanInput, TableUncheckedCreateWithoutFloorPlanInput> | TableCreateWithoutFloorPlanInput[] | TableUncheckedCreateWithoutFloorPlanInput[]
    connectOrCreate?: TableCreateOrConnectWithoutFloorPlanInput | TableCreateOrConnectWithoutFloorPlanInput[]
    upsert?: TableUpsertWithWhereUniqueWithoutFloorPlanInput | TableUpsertWithWhereUniqueWithoutFloorPlanInput[]
    createMany?: TableCreateManyFloorPlanInputEnvelope
    set?: TableWhereUniqueInput | TableWhereUniqueInput[]
    disconnect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    delete?: TableWhereUniqueInput | TableWhereUniqueInput[]
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    update?: TableUpdateWithWhereUniqueWithoutFloorPlanInput | TableUpdateWithWhereUniqueWithoutFloorPlanInput[]
    updateMany?: TableUpdateManyWithWhereWithoutFloorPlanInput | TableUpdateManyWithWhereWithoutFloorPlanInput[]
    deleteMany?: TableScalarWhereInput | TableScalarWhereInput[]
  }

  export type TableUncheckedUpdateManyWithoutFloorPlanNestedInput = {
    create?: XOR<TableCreateWithoutFloorPlanInput, TableUncheckedCreateWithoutFloorPlanInput> | TableCreateWithoutFloorPlanInput[] | TableUncheckedCreateWithoutFloorPlanInput[]
    connectOrCreate?: TableCreateOrConnectWithoutFloorPlanInput | TableCreateOrConnectWithoutFloorPlanInput[]
    upsert?: TableUpsertWithWhereUniqueWithoutFloorPlanInput | TableUpsertWithWhereUniqueWithoutFloorPlanInput[]
    createMany?: TableCreateManyFloorPlanInputEnvelope
    set?: TableWhereUniqueInput | TableWhereUniqueInput[]
    disconnect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    delete?: TableWhereUniqueInput | TableWhereUniqueInput[]
    connect?: TableWhereUniqueInput | TableWhereUniqueInput[]
    update?: TableUpdateWithWhereUniqueWithoutFloorPlanInput | TableUpdateWithWhereUniqueWithoutFloorPlanInput[]
    updateMany?: TableUpdateManyWithWhereWithoutFloorPlanInput | TableUpdateManyWithWhereWithoutFloorPlanInput[]
    deleteMany?: TableScalarWhereInput | TableScalarWhereInput[]
  }

  export type VenueCreateNestedOneWithoutTablesInput = {
    create?: XOR<VenueCreateWithoutTablesInput, VenueUncheckedCreateWithoutTablesInput>
    connectOrCreate?: VenueCreateOrConnectWithoutTablesInput
    connect?: VenueWhereUniqueInput
  }

  export type FloorPlanCreateNestedOneWithoutTablesInput = {
    create?: XOR<FloorPlanCreateWithoutTablesInput, FloorPlanUncheckedCreateWithoutTablesInput>
    connectOrCreate?: FloorPlanCreateOrConnectWithoutTablesInput
    connect?: FloorPlanWhereUniqueInput
  }

  export type ReservationCreateNestedManyWithoutTableInput = {
    create?: XOR<ReservationCreateWithoutTableInput, ReservationUncheckedCreateWithoutTableInput> | ReservationCreateWithoutTableInput[] | ReservationUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutTableInput | ReservationCreateOrConnectWithoutTableInput[]
    createMany?: ReservationCreateManyTableInputEnvelope
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
  }

  export type ReservationHoldCreateNestedManyWithoutTableInput = {
    create?: XOR<ReservationHoldCreateWithoutTableInput, ReservationHoldUncheckedCreateWithoutTableInput> | ReservationHoldCreateWithoutTableInput[] | ReservationHoldUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutTableInput | ReservationHoldCreateOrConnectWithoutTableInput[]
    createMany?: ReservationHoldCreateManyTableInputEnvelope
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
  }

  export type ReservationUncheckedCreateNestedManyWithoutTableInput = {
    create?: XOR<ReservationCreateWithoutTableInput, ReservationUncheckedCreateWithoutTableInput> | ReservationCreateWithoutTableInput[] | ReservationUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutTableInput | ReservationCreateOrConnectWithoutTableInput[]
    createMany?: ReservationCreateManyTableInputEnvelope
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
  }

  export type ReservationHoldUncheckedCreateNestedManyWithoutTableInput = {
    create?: XOR<ReservationHoldCreateWithoutTableInput, ReservationHoldUncheckedCreateWithoutTableInput> | ReservationHoldCreateWithoutTableInput[] | ReservationHoldUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutTableInput | ReservationHoldCreateOrConnectWithoutTableInput[]
    createMany?: ReservationHoldCreateManyTableInputEnvelope
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type EnumTableStatusFieldUpdateOperationsInput = {
    set?: $Enums.TableStatus
  }

  export type VenueUpdateOneWithoutTablesNestedInput = {
    create?: XOR<VenueCreateWithoutTablesInput, VenueUncheckedCreateWithoutTablesInput>
    connectOrCreate?: VenueCreateOrConnectWithoutTablesInput
    upsert?: VenueUpsertWithoutTablesInput
    disconnect?: VenueWhereInput | boolean
    delete?: VenueWhereInput | boolean
    connect?: VenueWhereUniqueInput
    update?: XOR<XOR<VenueUpdateToOneWithWhereWithoutTablesInput, VenueUpdateWithoutTablesInput>, VenueUncheckedUpdateWithoutTablesInput>
  }

  export type FloorPlanUpdateOneWithoutTablesNestedInput = {
    create?: XOR<FloorPlanCreateWithoutTablesInput, FloorPlanUncheckedCreateWithoutTablesInput>
    connectOrCreate?: FloorPlanCreateOrConnectWithoutTablesInput
    upsert?: FloorPlanUpsertWithoutTablesInput
    disconnect?: FloorPlanWhereInput | boolean
    delete?: FloorPlanWhereInput | boolean
    connect?: FloorPlanWhereUniqueInput
    update?: XOR<XOR<FloorPlanUpdateToOneWithWhereWithoutTablesInput, FloorPlanUpdateWithoutTablesInput>, FloorPlanUncheckedUpdateWithoutTablesInput>
  }

  export type ReservationUpdateManyWithoutTableNestedInput = {
    create?: XOR<ReservationCreateWithoutTableInput, ReservationUncheckedCreateWithoutTableInput> | ReservationCreateWithoutTableInput[] | ReservationUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutTableInput | ReservationCreateOrConnectWithoutTableInput[]
    upsert?: ReservationUpsertWithWhereUniqueWithoutTableInput | ReservationUpsertWithWhereUniqueWithoutTableInput[]
    createMany?: ReservationCreateManyTableInputEnvelope
    set?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    disconnect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    delete?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    update?: ReservationUpdateWithWhereUniqueWithoutTableInput | ReservationUpdateWithWhereUniqueWithoutTableInput[]
    updateMany?: ReservationUpdateManyWithWhereWithoutTableInput | ReservationUpdateManyWithWhereWithoutTableInput[]
    deleteMany?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
  }

  export type ReservationHoldUpdateManyWithoutTableNestedInput = {
    create?: XOR<ReservationHoldCreateWithoutTableInput, ReservationHoldUncheckedCreateWithoutTableInput> | ReservationHoldCreateWithoutTableInput[] | ReservationHoldUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutTableInput | ReservationHoldCreateOrConnectWithoutTableInput[]
    upsert?: ReservationHoldUpsertWithWhereUniqueWithoutTableInput | ReservationHoldUpsertWithWhereUniqueWithoutTableInput[]
    createMany?: ReservationHoldCreateManyTableInputEnvelope
    set?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    disconnect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    delete?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    update?: ReservationHoldUpdateWithWhereUniqueWithoutTableInput | ReservationHoldUpdateWithWhereUniqueWithoutTableInput[]
    updateMany?: ReservationHoldUpdateManyWithWhereWithoutTableInput | ReservationHoldUpdateManyWithWhereWithoutTableInput[]
    deleteMany?: ReservationHoldScalarWhereInput | ReservationHoldScalarWhereInput[]
  }

  export type ReservationUncheckedUpdateManyWithoutTableNestedInput = {
    create?: XOR<ReservationCreateWithoutTableInput, ReservationUncheckedCreateWithoutTableInput> | ReservationCreateWithoutTableInput[] | ReservationUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutTableInput | ReservationCreateOrConnectWithoutTableInput[]
    upsert?: ReservationUpsertWithWhereUniqueWithoutTableInput | ReservationUpsertWithWhereUniqueWithoutTableInput[]
    createMany?: ReservationCreateManyTableInputEnvelope
    set?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    disconnect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    delete?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    update?: ReservationUpdateWithWhereUniqueWithoutTableInput | ReservationUpdateWithWhereUniqueWithoutTableInput[]
    updateMany?: ReservationUpdateManyWithWhereWithoutTableInput | ReservationUpdateManyWithWhereWithoutTableInput[]
    deleteMany?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
  }

  export type ReservationHoldUncheckedUpdateManyWithoutTableNestedInput = {
    create?: XOR<ReservationHoldCreateWithoutTableInput, ReservationHoldUncheckedCreateWithoutTableInput> | ReservationHoldCreateWithoutTableInput[] | ReservationHoldUncheckedCreateWithoutTableInput[]
    connectOrCreate?: ReservationHoldCreateOrConnectWithoutTableInput | ReservationHoldCreateOrConnectWithoutTableInput[]
    upsert?: ReservationHoldUpsertWithWhereUniqueWithoutTableInput | ReservationHoldUpsertWithWhereUniqueWithoutTableInput[]
    createMany?: ReservationHoldCreateManyTableInputEnvelope
    set?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    disconnect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    delete?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    connect?: ReservationHoldWhereUniqueInput | ReservationHoldWhereUniqueInput[]
    update?: ReservationHoldUpdateWithWhereUniqueWithoutTableInput | ReservationHoldUpdateWithWhereUniqueWithoutTableInput[]
    updateMany?: ReservationHoldUpdateManyWithWhereWithoutTableInput | ReservationHoldUpdateManyWithWhereWithoutTableInput[]
    deleteMany?: ReservationHoldScalarWhereInput | ReservationHoldScalarWhereInput[]
  }

  export type VenueCreateNestedOneWithoutGuestsInput = {
    create?: XOR<VenueCreateWithoutGuestsInput, VenueUncheckedCreateWithoutGuestsInput>
    connectOrCreate?: VenueCreateOrConnectWithoutGuestsInput
    connect?: VenueWhereUniqueInput
  }

  export type ReservationCreateNestedManyWithoutGuestInput = {
    create?: XOR<ReservationCreateWithoutGuestInput, ReservationUncheckedCreateWithoutGuestInput> | ReservationCreateWithoutGuestInput[] | ReservationUncheckedCreateWithoutGuestInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutGuestInput | ReservationCreateOrConnectWithoutGuestInput[]
    createMany?: ReservationCreateManyGuestInputEnvelope
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
  }

  export type ReservationUncheckedCreateNestedManyWithoutGuestInput = {
    create?: XOR<ReservationCreateWithoutGuestInput, ReservationUncheckedCreateWithoutGuestInput> | ReservationCreateWithoutGuestInput[] | ReservationUncheckedCreateWithoutGuestInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutGuestInput | ReservationCreateOrConnectWithoutGuestInput[]
    createMany?: ReservationCreateManyGuestInputEnvelope
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
  }

  export type NullableDecimalFieldUpdateOperationsInput = {
    set?: Decimal | DecimalJsLike | number | string | null
    increment?: Decimal | DecimalJsLike | number | string
    decrement?: Decimal | DecimalJsLike | number | string
    multiply?: Decimal | DecimalJsLike | number | string
    divide?: Decimal | DecimalJsLike | number | string
  }

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null
  }

  export type EnumCommunicationPreferenceFieldUpdateOperationsInput = {
    set?: $Enums.CommunicationPreference
  }

  export type VenueUpdateOneRequiredWithoutGuestsNestedInput = {
    create?: XOR<VenueCreateWithoutGuestsInput, VenueUncheckedCreateWithoutGuestsInput>
    connectOrCreate?: VenueCreateOrConnectWithoutGuestsInput
    upsert?: VenueUpsertWithoutGuestsInput
    connect?: VenueWhereUniqueInput
    update?: XOR<XOR<VenueUpdateToOneWithWhereWithoutGuestsInput, VenueUpdateWithoutGuestsInput>, VenueUncheckedUpdateWithoutGuestsInput>
  }

  export type ReservationUpdateManyWithoutGuestNestedInput = {
    create?: XOR<ReservationCreateWithoutGuestInput, ReservationUncheckedCreateWithoutGuestInput> | ReservationCreateWithoutGuestInput[] | ReservationUncheckedCreateWithoutGuestInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutGuestInput | ReservationCreateOrConnectWithoutGuestInput[]
    upsert?: ReservationUpsertWithWhereUniqueWithoutGuestInput | ReservationUpsertWithWhereUniqueWithoutGuestInput[]
    createMany?: ReservationCreateManyGuestInputEnvelope
    set?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    disconnect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    delete?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    update?: ReservationUpdateWithWhereUniqueWithoutGuestInput | ReservationUpdateWithWhereUniqueWithoutGuestInput[]
    updateMany?: ReservationUpdateManyWithWhereWithoutGuestInput | ReservationUpdateManyWithWhereWithoutGuestInput[]
    deleteMany?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
  }

  export type ReservationUncheckedUpdateManyWithoutGuestNestedInput = {
    create?: XOR<ReservationCreateWithoutGuestInput, ReservationUncheckedCreateWithoutGuestInput> | ReservationCreateWithoutGuestInput[] | ReservationUncheckedCreateWithoutGuestInput[]
    connectOrCreate?: ReservationCreateOrConnectWithoutGuestInput | ReservationCreateOrConnectWithoutGuestInput[]
    upsert?: ReservationUpsertWithWhereUniqueWithoutGuestInput | ReservationUpsertWithWhereUniqueWithoutGuestInput[]
    createMany?: ReservationCreateManyGuestInputEnvelope
    set?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    disconnect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    delete?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    connect?: ReservationWhereUniqueInput | ReservationWhereUniqueInput[]
    update?: ReservationUpdateWithWhereUniqueWithoutGuestInput | ReservationUpdateWithWhereUniqueWithoutGuestInput[]
    updateMany?: ReservationUpdateManyWithWhereWithoutGuestInput | ReservationUpdateManyWithWhereWithoutGuestInput[]
    deleteMany?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
  }

  export type GuestCreateNestedOneWithoutReservationsInput = {
    create?: XOR<GuestCreateWithoutReservationsInput, GuestUncheckedCreateWithoutReservationsInput>
    connectOrCreate?: GuestCreateOrConnectWithoutReservationsInput
    connect?: GuestWhereUniqueInput
  }

  export type TableCreateNestedOneWithoutReservationsInput = {
    create?: XOR<TableCreateWithoutReservationsInput, TableUncheckedCreateWithoutReservationsInput>
    connectOrCreate?: TableCreateOrConnectWithoutReservationsInput
    connect?: TableWhereUniqueInput
  }

  export type VenueCreateNestedOneWithoutReservationsInput = {
    create?: XOR<VenueCreateWithoutReservationsInput, VenueUncheckedCreateWithoutReservationsInput>
    connectOrCreate?: VenueCreateOrConnectWithoutReservationsInput
    connect?: VenueWhereUniqueInput
  }

  export type DepositCreateNestedOneWithoutReservationInput = {
    create?: XOR<DepositCreateWithoutReservationInput, DepositUncheckedCreateWithoutReservationInput>
    connectOrCreate?: DepositCreateOrConnectWithoutReservationInput
    connect?: DepositWhereUniqueInput
  }

  export type DepositUncheckedCreateNestedOneWithoutReservationInput = {
    create?: XOR<DepositCreateWithoutReservationInput, DepositUncheckedCreateWithoutReservationInput>
    connectOrCreate?: DepositCreateOrConnectWithoutReservationInput
    connect?: DepositWhereUniqueInput
  }

  export type EnumReservationStatusFieldUpdateOperationsInput = {
    set?: $Enums.ReservationStatus
  }

  export type NullableEnumOccasionFieldUpdateOperationsInput = {
    set?: $Enums.Occasion | null
  }

  export type NullableEnumSeatingPreferenceFieldUpdateOperationsInput = {
    set?: $Enums.SeatingPreference | null
  }

  export type GuestUpdateOneWithoutReservationsNestedInput = {
    create?: XOR<GuestCreateWithoutReservationsInput, GuestUncheckedCreateWithoutReservationsInput>
    connectOrCreate?: GuestCreateOrConnectWithoutReservationsInput
    upsert?: GuestUpsertWithoutReservationsInput
    disconnect?: GuestWhereInput | boolean
    delete?: GuestWhereInput | boolean
    connect?: GuestWhereUniqueInput
    update?: XOR<XOR<GuestUpdateToOneWithWhereWithoutReservationsInput, GuestUpdateWithoutReservationsInput>, GuestUncheckedUpdateWithoutReservationsInput>
  }

  export type TableUpdateOneRequiredWithoutReservationsNestedInput = {
    create?: XOR<TableCreateWithoutReservationsInput, TableUncheckedCreateWithoutReservationsInput>
    connectOrCreate?: TableCreateOrConnectWithoutReservationsInput
    upsert?: TableUpsertWithoutReservationsInput
    connect?: TableWhereUniqueInput
    update?: XOR<XOR<TableUpdateToOneWithWhereWithoutReservationsInput, TableUpdateWithoutReservationsInput>, TableUncheckedUpdateWithoutReservationsInput>
  }

  export type VenueUpdateOneWithoutReservationsNestedInput = {
    create?: XOR<VenueCreateWithoutReservationsInput, VenueUncheckedCreateWithoutReservationsInput>
    connectOrCreate?: VenueCreateOrConnectWithoutReservationsInput
    upsert?: VenueUpsertWithoutReservationsInput
    disconnect?: VenueWhereInput | boolean
    delete?: VenueWhereInput | boolean
    connect?: VenueWhereUniqueInput
    update?: XOR<XOR<VenueUpdateToOneWithWhereWithoutReservationsInput, VenueUpdateWithoutReservationsInput>, VenueUncheckedUpdateWithoutReservationsInput>
  }

  export type DepositUpdateOneWithoutReservationNestedInput = {
    create?: XOR<DepositCreateWithoutReservationInput, DepositUncheckedCreateWithoutReservationInput>
    connectOrCreate?: DepositCreateOrConnectWithoutReservationInput
    upsert?: DepositUpsertWithoutReservationInput
    disconnect?: DepositWhereInput | boolean
    delete?: DepositWhereInput | boolean
    connect?: DepositWhereUniqueInput
    update?: XOR<XOR<DepositUpdateToOneWithWhereWithoutReservationInput, DepositUpdateWithoutReservationInput>, DepositUncheckedUpdateWithoutReservationInput>
  }

  export type DepositUncheckedUpdateOneWithoutReservationNestedInput = {
    create?: XOR<DepositCreateWithoutReservationInput, DepositUncheckedCreateWithoutReservationInput>
    connectOrCreate?: DepositCreateOrConnectWithoutReservationInput
    upsert?: DepositUpsertWithoutReservationInput
    disconnect?: DepositWhereInput | boolean
    delete?: DepositWhereInput | boolean
    connect?: DepositWhereUniqueInput
    update?: XOR<XOR<DepositUpdateToOneWithWhereWithoutReservationInput, DepositUpdateWithoutReservationInput>, DepositUncheckedUpdateWithoutReservationInput>
  }

  export type ReservationCreateNestedOneWithoutDepositInput = {
    create?: XOR<ReservationCreateWithoutDepositInput, ReservationUncheckedCreateWithoutDepositInput>
    connectOrCreate?: ReservationCreateOrConnectWithoutDepositInput
    connect?: ReservationWhereUniqueInput
  }

  export type EnumDepositStatusFieldUpdateOperationsInput = {
    set?: $Enums.DepositStatus
  }

  export type ReservationUpdateOneRequiredWithoutDepositNestedInput = {
    create?: XOR<ReservationCreateWithoutDepositInput, ReservationUncheckedCreateWithoutDepositInput>
    connectOrCreate?: ReservationCreateOrConnectWithoutDepositInput
    upsert?: ReservationUpsertWithoutDepositInput
    connect?: ReservationWhereUniqueInput
    update?: XOR<XOR<ReservationUpdateToOneWithWhereWithoutDepositInput, ReservationUpdateWithoutDepositInput>, ReservationUncheckedUpdateWithoutDepositInput>
  }

  export type EnumWaitlistStatusFieldUpdateOperationsInput = {
    set?: $Enums.WaitlistStatus
  }

  export type VenueCreateNestedOneWithoutHoldsInput = {
    create?: XOR<VenueCreateWithoutHoldsInput, VenueUncheckedCreateWithoutHoldsInput>
    connectOrCreate?: VenueCreateOrConnectWithoutHoldsInput
    connect?: VenueWhereUniqueInput
  }

  export type TableCreateNestedOneWithoutHoldsInput = {
    create?: XOR<TableCreateWithoutHoldsInput, TableUncheckedCreateWithoutHoldsInput>
    connectOrCreate?: TableCreateOrConnectWithoutHoldsInput
    connect?: TableWhereUniqueInput
  }

  export type VenueUpdateOneRequiredWithoutHoldsNestedInput = {
    create?: XOR<VenueCreateWithoutHoldsInput, VenueUncheckedCreateWithoutHoldsInput>
    connectOrCreate?: VenueCreateOrConnectWithoutHoldsInput
    upsert?: VenueUpsertWithoutHoldsInput
    connect?: VenueWhereUniqueInput
    update?: XOR<XOR<VenueUpdateToOneWithWhereWithoutHoldsInput, VenueUpdateWithoutHoldsInput>, VenueUncheckedUpdateWithoutHoldsInput>
  }

  export type TableUpdateOneRequiredWithoutHoldsNestedInput = {
    create?: XOR<TableCreateWithoutHoldsInput, TableUncheckedCreateWithoutHoldsInput>
    connectOrCreate?: TableCreateOrConnectWithoutHoldsInput
    upsert?: TableUpsertWithoutHoldsInput
    connect?: TableWhereUniqueInput
    update?: XOR<XOR<TableUpdateToOneWithWhereWithoutHoldsInput, TableUpdateWithoutHoldsInput>, TableUncheckedUpdateWithoutHoldsInput>
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonNullableFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonNullableFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonNullableFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonNullableFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonNullableFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolFilter<$PrismaModel> | boolean
  }

  export type NestedEnumDepositTypeNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDepositTypeNullableFilter<$PrismaModel> | $Enums.DepositType | null
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedBoolFilter<$PrismaModel>
    _max?: NestedBoolFilter<$PrismaModel>
  }

  export type NestedEnumDepositTypeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositType | EnumDepositTypeFieldRefInput<$PrismaModel> | null
    in?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.DepositType[] | ListEnumDepositTypeFieldRefInput<$PrismaModel> | null
    not?: NestedEnumDepositTypeNullableWithAggregatesFilter<$PrismaModel> | $Enums.DepositType | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumDepositTypeNullableFilter<$PrismaModel>
    _max?: NestedEnumDepositTypeNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedFloatNullableFilter<$PrismaModel>
    _sum?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedIntNullableFilter<$PrismaModel>
    _max?: NestedIntNullableFilter<$PrismaModel>
  }

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null
  }
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<Required<NestedJsonFilterBase<$PrismaModel>>, Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, 'path'>>

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
    path?: string[]
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>
    string_contains?: string | StringFieldRefInput<$PrismaModel>
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter
  }

  export type NestedEnumTableStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.TableStatus | EnumTableStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTableStatusFilter<$PrismaModel> | $Enums.TableStatus
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedEnumTableStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.TableStatus | EnumTableStatusFieldRefInput<$PrismaModel>
    in?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.TableStatus[] | ListEnumTableStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumTableStatusWithAggregatesFilter<$PrismaModel> | $Enums.TableStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumTableStatusFilter<$PrismaModel>
    _max?: NestedEnumTableStatusFilter<$PrismaModel>
  }

  export type NestedDecimalNullableFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
  }

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null
  }

  export type NestedEnumCommunicationPreferenceFilter<$PrismaModel = never> = {
    equals?: $Enums.CommunicationPreference | EnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumCommunicationPreferenceFilter<$PrismaModel> | $Enums.CommunicationPreference
  }

  export type NestedDecimalNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel> | null
    in?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    notIn?: Decimal[] | DecimalJsLike[] | number[] | string[] | ListDecimalFieldRefInput<$PrismaModel> | null
    lt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    lte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gt?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    gte?: Decimal | DecimalJsLike | number | string | DecimalFieldRefInput<$PrismaModel>
    not?: NestedDecimalNullableWithAggregatesFilter<$PrismaModel> | Decimal | DecimalJsLike | number | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _avg?: NestedDecimalNullableFilter<$PrismaModel>
    _sum?: NestedDecimalNullableFilter<$PrismaModel>
    _min?: NestedDecimalNullableFilter<$PrismaModel>
    _max?: NestedDecimalNullableFilter<$PrismaModel>
  }

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedDateTimeNullableFilter<$PrismaModel>
    _max?: NestedDateTimeNullableFilter<$PrismaModel>
  }

  export type NestedEnumCommunicationPreferenceWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.CommunicationPreference | EnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    in?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    notIn?: $Enums.CommunicationPreference[] | ListEnumCommunicationPreferenceFieldRefInput<$PrismaModel>
    not?: NestedEnumCommunicationPreferenceWithAggregatesFilter<$PrismaModel> | $Enums.CommunicationPreference
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumCommunicationPreferenceFilter<$PrismaModel>
    _max?: NestedEnumCommunicationPreferenceFilter<$PrismaModel>
  }

  export type NestedEnumReservationStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.ReservationStatus | EnumReservationStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumReservationStatusFilter<$PrismaModel> | $Enums.ReservationStatus
  }

  export type NestedEnumOccasionNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.Occasion | EnumOccasionFieldRefInput<$PrismaModel> | null
    in?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    not?: NestedEnumOccasionNullableFilter<$PrismaModel> | $Enums.Occasion | null
  }

  export type NestedEnumSeatingPreferenceNullableFilter<$PrismaModel = never> = {
    equals?: $Enums.SeatingPreference | EnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    in?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    not?: NestedEnumSeatingPreferenceNullableFilter<$PrismaModel> | $Enums.SeatingPreference | null
  }

  export type NestedEnumReservationStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.ReservationStatus | EnumReservationStatusFieldRefInput<$PrismaModel>
    in?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.ReservationStatus[] | ListEnumReservationStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumReservationStatusWithAggregatesFilter<$PrismaModel> | $Enums.ReservationStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumReservationStatusFilter<$PrismaModel>
    _max?: NestedEnumReservationStatusFilter<$PrismaModel>
  }

  export type NestedEnumOccasionNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.Occasion | EnumOccasionFieldRefInput<$PrismaModel> | null
    in?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.Occasion[] | ListEnumOccasionFieldRefInput<$PrismaModel> | null
    not?: NestedEnumOccasionNullableWithAggregatesFilter<$PrismaModel> | $Enums.Occasion | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumOccasionNullableFilter<$PrismaModel>
    _max?: NestedEnumOccasionNullableFilter<$PrismaModel>
  }

  export type NestedEnumSeatingPreferenceNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SeatingPreference | EnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    in?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    notIn?: $Enums.SeatingPreference[] | ListEnumSeatingPreferenceFieldRefInput<$PrismaModel> | null
    not?: NestedEnumSeatingPreferenceNullableWithAggregatesFilter<$PrismaModel> | $Enums.SeatingPreference | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedEnumSeatingPreferenceNullableFilter<$PrismaModel>
    _max?: NestedEnumSeatingPreferenceNullableFilter<$PrismaModel>
  }

  export type NestedEnumDepositStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusFilter<$PrismaModel> | $Enums.DepositStatus
  }

  export type NestedEnumDepositStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.DepositStatus | EnumDepositStatusFieldRefInput<$PrismaModel>
    in?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.DepositStatus[] | ListEnumDepositStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumDepositStatusWithAggregatesFilter<$PrismaModel> | $Enums.DepositStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumDepositStatusFilter<$PrismaModel>
    _max?: NestedEnumDepositStatusFilter<$PrismaModel>
  }

  export type NestedEnumWaitlistStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.WaitlistStatus | EnumWaitlistStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWaitlistStatusFilter<$PrismaModel> | $Enums.WaitlistStatus
  }

  export type NestedEnumWaitlistStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.WaitlistStatus | EnumWaitlistStatusFieldRefInput<$PrismaModel>
    in?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    notIn?: $Enums.WaitlistStatus[] | ListEnumWaitlistStatusFieldRefInput<$PrismaModel>
    not?: NestedEnumWaitlistStatusWithAggregatesFilter<$PrismaModel> | $Enums.WaitlistStatus
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedEnumWaitlistStatusFilter<$PrismaModel>
    _max?: NestedEnumWaitlistStatusFilter<$PrismaModel>
  }

  export type VenueCreateWithoutVenueGroupInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableCreateNestedManyWithoutVenueInput
    reservations?: ReservationCreateNestedManyWithoutVenueInput
    guests?: GuestCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateWithoutVenueGroupInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutVenueInput
    reservations?: ReservationUncheckedCreateNestedManyWithoutVenueInput
    guests?: GuestUncheckedCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanUncheckedCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueCreateOrConnectWithoutVenueGroupInput = {
    where: VenueWhereUniqueInput
    create: XOR<VenueCreateWithoutVenueGroupInput, VenueUncheckedCreateWithoutVenueGroupInput>
  }

  export type VenueCreateManyVenueGroupInputEnvelope = {
    data: VenueCreateManyVenueGroupInput | VenueCreateManyVenueGroupInput[]
    skipDuplicates?: boolean
  }

  export type VenueUpsertWithWhereUniqueWithoutVenueGroupInput = {
    where: VenueWhereUniqueInput
    update: XOR<VenueUpdateWithoutVenueGroupInput, VenueUncheckedUpdateWithoutVenueGroupInput>
    create: XOR<VenueCreateWithoutVenueGroupInput, VenueUncheckedCreateWithoutVenueGroupInput>
  }

  export type VenueUpdateWithWhereUniqueWithoutVenueGroupInput = {
    where: VenueWhereUniqueInput
    data: XOR<VenueUpdateWithoutVenueGroupInput, VenueUncheckedUpdateWithoutVenueGroupInput>
  }

  export type VenueUpdateManyWithWhereWithoutVenueGroupInput = {
    where: VenueScalarWhereInput
    data: XOR<VenueUpdateManyMutationInput, VenueUncheckedUpdateManyWithoutVenueGroupInput>
  }

  export type VenueScalarWhereInput = {
    AND?: VenueScalarWhereInput | VenueScalarWhereInput[]
    OR?: VenueScalarWhereInput[]
    NOT?: VenueScalarWhereInput | VenueScalarWhereInput[]
    id?: StringFilter<"Venue"> | string
    venueGroupId?: StringNullableFilter<"Venue"> | string | null
    name?: StringFilter<"Venue"> | string
    slug?: StringFilter<"Venue"> | string
    ianaTimezone?: StringFilter<"Venue"> | string
    currencyCode?: StringFilter<"Venue"> | string
    operatingHours?: JsonNullableFilter<"Venue">
    settings?: JsonNullableFilter<"Venue">
    depositEnabled?: BoolFilter<"Venue"> | boolean
    depositType?: EnumDepositTypeNullableFilter<"Venue"> | $Enums.DepositType | null
    depositAmountCents?: IntNullableFilter<"Venue"> | number | null
    freeCancellationHours?: IntNullableFilter<"Venue"> | number | null
    lateCancellationFeePercent?: IntNullableFilter<"Venue"> | number | null
    noShowFeePercent?: IntNullableFilter<"Venue"> | number | null
    createdAt?: DateTimeFilter<"Venue"> | Date | string
    updatedAt?: DateTimeFilter<"Venue"> | Date | string
  }

  export type VenueGroupCreateWithoutVenuesInput = {
    id?: string
    name: string
    slug: string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type VenueGroupUncheckedCreateWithoutVenuesInput = {
    id?: string
    name: string
    slug: string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
  }

  export type VenueGroupCreateOrConnectWithoutVenuesInput = {
    where: VenueGroupWhereUniqueInput
    create: XOR<VenueGroupCreateWithoutVenuesInput, VenueGroupUncheckedCreateWithoutVenuesInput>
  }

  export type TableCreateWithoutVenueInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    floorPlan?: FloorPlanCreateNestedOneWithoutTablesInput
    reservations?: ReservationCreateNestedManyWithoutTableInput
    holds?: ReservationHoldCreateNestedManyWithoutTableInput
  }

  export type TableUncheckedCreateWithoutVenueInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    floorPlanId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutTableInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutTableInput
  }

  export type TableCreateOrConnectWithoutVenueInput = {
    where: TableWhereUniqueInput
    create: XOR<TableCreateWithoutVenueInput, TableUncheckedCreateWithoutVenueInput>
  }

  export type TableCreateManyVenueInputEnvelope = {
    data: TableCreateManyVenueInput | TableCreateManyVenueInput[]
    skipDuplicates?: boolean
  }

  export type ReservationCreateWithoutVenueInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    guest?: GuestCreateNestedOneWithoutReservationsInput
    table: TableCreateNestedOneWithoutReservationsInput
    deposit?: DepositCreateNestedOneWithoutReservationInput
  }

  export type ReservationUncheckedCreateWithoutVenueInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    tableId: string
    createdAt?: Date | string
    updatedAt?: Date | string
    deposit?: DepositUncheckedCreateNestedOneWithoutReservationInput
  }

  export type ReservationCreateOrConnectWithoutVenueInput = {
    where: ReservationWhereUniqueInput
    create: XOR<ReservationCreateWithoutVenueInput, ReservationUncheckedCreateWithoutVenueInput>
  }

  export type ReservationCreateManyVenueInputEnvelope = {
    data: ReservationCreateManyVenueInput | ReservationCreateManyVenueInput[]
    skipDuplicates?: boolean
  }

  export type GuestCreateWithoutVenueInput = {
    id?: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationCreateNestedManyWithoutGuestInput
  }

  export type GuestUncheckedCreateWithoutVenueInput = {
    id?: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutGuestInput
  }

  export type GuestCreateOrConnectWithoutVenueInput = {
    where: GuestWhereUniqueInput
    create: XOR<GuestCreateWithoutVenueInput, GuestUncheckedCreateWithoutVenueInput>
  }

  export type GuestCreateManyVenueInputEnvelope = {
    data: GuestCreateManyVenueInput | GuestCreateManyVenueInput[]
    skipDuplicates?: boolean
  }

  export type FloorPlanCreateWithoutVenueInput = {
    id?: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableCreateNestedManyWithoutFloorPlanInput
  }

  export type FloorPlanUncheckedCreateWithoutVenueInput = {
    id?: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutFloorPlanInput
  }

  export type FloorPlanCreateOrConnectWithoutVenueInput = {
    where: FloorPlanWhereUniqueInput
    create: XOR<FloorPlanCreateWithoutVenueInput, FloorPlanUncheckedCreateWithoutVenueInput>
  }

  export type FloorPlanCreateManyVenueInputEnvelope = {
    data: FloorPlanCreateManyVenueInput | FloorPlanCreateManyVenueInput[]
    skipDuplicates?: boolean
  }

  export type ReservationHoldCreateWithoutVenueInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
    table: TableCreateNestedOneWithoutHoldsInput
  }

  export type ReservationHoldUncheckedCreateWithoutVenueInput = {
    id?: string
    tableId: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
  }

  export type ReservationHoldCreateOrConnectWithoutVenueInput = {
    where: ReservationHoldWhereUniqueInput
    create: XOR<ReservationHoldCreateWithoutVenueInput, ReservationHoldUncheckedCreateWithoutVenueInput>
  }

  export type ReservationHoldCreateManyVenueInputEnvelope = {
    data: ReservationHoldCreateManyVenueInput | ReservationHoldCreateManyVenueInput[]
    skipDuplicates?: boolean
  }

  export type VenueGroupUpsertWithoutVenuesInput = {
    update: XOR<VenueGroupUpdateWithoutVenuesInput, VenueGroupUncheckedUpdateWithoutVenuesInput>
    create: XOR<VenueGroupCreateWithoutVenuesInput, VenueGroupUncheckedCreateWithoutVenuesInput>
    where?: VenueGroupWhereInput
  }

  export type VenueGroupUpdateToOneWithWhereWithoutVenuesInput = {
    where?: VenueGroupWhereInput
    data: XOR<VenueGroupUpdateWithoutVenuesInput, VenueGroupUncheckedUpdateWithoutVenuesInput>
  }

  export type VenueGroupUpdateWithoutVenuesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VenueGroupUncheckedUpdateWithoutVenuesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    settings?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TableUpsertWithWhereUniqueWithoutVenueInput = {
    where: TableWhereUniqueInput
    update: XOR<TableUpdateWithoutVenueInput, TableUncheckedUpdateWithoutVenueInput>
    create: XOR<TableCreateWithoutVenueInput, TableUncheckedCreateWithoutVenueInput>
  }

  export type TableUpdateWithWhereUniqueWithoutVenueInput = {
    where: TableWhereUniqueInput
    data: XOR<TableUpdateWithoutVenueInput, TableUncheckedUpdateWithoutVenueInput>
  }

  export type TableUpdateManyWithWhereWithoutVenueInput = {
    where: TableScalarWhereInput
    data: XOR<TableUpdateManyMutationInput, TableUncheckedUpdateManyWithoutVenueInput>
  }

  export type TableScalarWhereInput = {
    AND?: TableScalarWhereInput | TableScalarWhereInput[]
    OR?: TableScalarWhereInput[]
    NOT?: TableScalarWhereInput | TableScalarWhereInput[]
    id?: StringFilter<"Table"> | string
    name?: StringFilter<"Table"> | string
    tableNumber?: StringNullableFilter<"Table"> | string | null
    capacity?: IntFilter<"Table"> | number
    minCovers?: IntFilter<"Table"> | number
    maxCovers?: IntNullableFilter<"Table"> | number | null
    location?: StringNullableFilter<"Table"> | string | null
    isActive?: BoolFilter<"Table"> | boolean
    status?: EnumTableStatusFilter<"Table"> | $Enums.TableStatus
    priority?: IntFilter<"Table"> | number
    venueId?: StringNullableFilter<"Table"> | string | null
    floorPlanId?: StringNullableFilter<"Table"> | string | null
    shapeMetadata?: JsonNullableFilter<"Table">
    createdAt?: DateTimeFilter<"Table"> | Date | string
    updatedAt?: DateTimeFilter<"Table"> | Date | string
  }

  export type ReservationUpsertWithWhereUniqueWithoutVenueInput = {
    where: ReservationWhereUniqueInput
    update: XOR<ReservationUpdateWithoutVenueInput, ReservationUncheckedUpdateWithoutVenueInput>
    create: XOR<ReservationCreateWithoutVenueInput, ReservationUncheckedCreateWithoutVenueInput>
  }

  export type ReservationUpdateWithWhereUniqueWithoutVenueInput = {
    where: ReservationWhereUniqueInput
    data: XOR<ReservationUpdateWithoutVenueInput, ReservationUncheckedUpdateWithoutVenueInput>
  }

  export type ReservationUpdateManyWithWhereWithoutVenueInput = {
    where: ReservationScalarWhereInput
    data: XOR<ReservationUpdateManyMutationInput, ReservationUncheckedUpdateManyWithoutVenueInput>
  }

  export type ReservationScalarWhereInput = {
    AND?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
    OR?: ReservationScalarWhereInput[]
    NOT?: ReservationScalarWhereInput | ReservationScalarWhereInput[]
    id?: StringFilter<"Reservation"> | string
    date?: DateTimeFilter<"Reservation"> | Date | string
    startTime?: DateTimeFilter<"Reservation"> | Date | string
    endTime?: DateTimeFilter<"Reservation"> | Date | string
    partySize?: IntFilter<"Reservation"> | number
    status?: EnumReservationStatusFilter<"Reservation"> | $Enums.ReservationStatus
    notes?: StringNullableFilter<"Reservation"> | string | null
    cancellationReason?: StringNullableFilter<"Reservation"> | string | null
    cancellationNote?: StringNullableFilter<"Reservation"> | string | null
    occasion?: EnumOccasionNullableFilter<"Reservation"> | $Enums.Occasion | null
    seatingPreference?: EnumSeatingPreferenceNullableFilter<"Reservation"> | $Enums.SeatingPreference | null
    guestName?: StringNullableFilter<"Reservation"> | string | null
    guestEmail?: StringNullableFilter<"Reservation"> | string | null
    guestPhone?: StringNullableFilter<"Reservation"> | string | null
    guestId?: StringNullableFilter<"Reservation"> | string | null
    userId?: StringNullableFilter<"Reservation"> | string | null
    tableId?: StringFilter<"Reservation"> | string
    venueId?: StringNullableFilter<"Reservation"> | string | null
    createdAt?: DateTimeFilter<"Reservation"> | Date | string
    updatedAt?: DateTimeFilter<"Reservation"> | Date | string
  }

  export type GuestUpsertWithWhereUniqueWithoutVenueInput = {
    where: GuestWhereUniqueInput
    update: XOR<GuestUpdateWithoutVenueInput, GuestUncheckedUpdateWithoutVenueInput>
    create: XOR<GuestCreateWithoutVenueInput, GuestUncheckedCreateWithoutVenueInput>
  }

  export type GuestUpdateWithWhereUniqueWithoutVenueInput = {
    where: GuestWhereUniqueInput
    data: XOR<GuestUpdateWithoutVenueInput, GuestUncheckedUpdateWithoutVenueInput>
  }

  export type GuestUpdateManyWithWhereWithoutVenueInput = {
    where: GuestScalarWhereInput
    data: XOR<GuestUpdateManyMutationInput, GuestUncheckedUpdateManyWithoutVenueInput>
  }

  export type GuestScalarWhereInput = {
    AND?: GuestScalarWhereInput | GuestScalarWhereInput[]
    OR?: GuestScalarWhereInput[]
    NOT?: GuestScalarWhereInput | GuestScalarWhereInput[]
    id?: StringFilter<"Guest"> | string
    venueId?: StringFilter<"Guest"> | string
    email?: StringNullableFilter<"Guest"> | string | null
    phone?: StringNullableFilter<"Guest"> | string | null
    name?: StringFilter<"Guest"> | string
    notes?: StringNullableFilter<"Guest"> | string | null
    visitCount?: IntFilter<"Guest"> | number
    lifetimeSpend?: DecimalNullableFilter<"Guest"> | Decimal | DecimalJsLike | number | string | null
    lastVisit?: DateTimeNullableFilter<"Guest"> | Date | string | null
    tags?: JsonNullableFilter<"Guest">
    dietaryRestrictions?: JsonNullableFilter<"Guest">
    staffNotes?: JsonNullableFilter<"Guest">
    communicationPreference?: EnumCommunicationPreferenceFilter<"Guest"> | $Enums.CommunicationPreference
    stripeCustomerId?: StringNullableFilter<"Guest"> | string | null
    createdAt?: DateTimeFilter<"Guest"> | Date | string
    updatedAt?: DateTimeFilter<"Guest"> | Date | string
  }

  export type FloorPlanUpsertWithWhereUniqueWithoutVenueInput = {
    where: FloorPlanWhereUniqueInput
    update: XOR<FloorPlanUpdateWithoutVenueInput, FloorPlanUncheckedUpdateWithoutVenueInput>
    create: XOR<FloorPlanCreateWithoutVenueInput, FloorPlanUncheckedCreateWithoutVenueInput>
  }

  export type FloorPlanUpdateWithWhereUniqueWithoutVenueInput = {
    where: FloorPlanWhereUniqueInput
    data: XOR<FloorPlanUpdateWithoutVenueInput, FloorPlanUncheckedUpdateWithoutVenueInput>
  }

  export type FloorPlanUpdateManyWithWhereWithoutVenueInput = {
    where: FloorPlanScalarWhereInput
    data: XOR<FloorPlanUpdateManyMutationInput, FloorPlanUncheckedUpdateManyWithoutVenueInput>
  }

  export type FloorPlanScalarWhereInput = {
    AND?: FloorPlanScalarWhereInput | FloorPlanScalarWhereInput[]
    OR?: FloorPlanScalarWhereInput[]
    NOT?: FloorPlanScalarWhereInput | FloorPlanScalarWhereInput[]
    id?: StringFilter<"FloorPlan"> | string
    venueId?: StringFilter<"FloorPlan"> | string
    name?: StringFilter<"FloorPlan"> | string
    isActive?: BoolFilter<"FloorPlan"> | boolean
    layoutJson?: JsonFilter<"FloorPlan">
    createdAt?: DateTimeFilter<"FloorPlan"> | Date | string
    updatedAt?: DateTimeFilter<"FloorPlan"> | Date | string
  }

  export type ReservationHoldUpsertWithWhereUniqueWithoutVenueInput = {
    where: ReservationHoldWhereUniqueInput
    update: XOR<ReservationHoldUpdateWithoutVenueInput, ReservationHoldUncheckedUpdateWithoutVenueInput>
    create: XOR<ReservationHoldCreateWithoutVenueInput, ReservationHoldUncheckedCreateWithoutVenueInput>
  }

  export type ReservationHoldUpdateWithWhereUniqueWithoutVenueInput = {
    where: ReservationHoldWhereUniqueInput
    data: XOR<ReservationHoldUpdateWithoutVenueInput, ReservationHoldUncheckedUpdateWithoutVenueInput>
  }

  export type ReservationHoldUpdateManyWithWhereWithoutVenueInput = {
    where: ReservationHoldScalarWhereInput
    data: XOR<ReservationHoldUpdateManyMutationInput, ReservationHoldUncheckedUpdateManyWithoutVenueInput>
  }

  export type ReservationHoldScalarWhereInput = {
    AND?: ReservationHoldScalarWhereInput | ReservationHoldScalarWhereInput[]
    OR?: ReservationHoldScalarWhereInput[]
    NOT?: ReservationHoldScalarWhereInput | ReservationHoldScalarWhereInput[]
    id?: StringFilter<"ReservationHold"> | string
    venueId?: StringFilter<"ReservationHold"> | string
    tableId?: StringFilter<"ReservationHold"> | string
    date?: DateTimeFilter<"ReservationHold"> | Date | string
    startTime?: DateTimeFilter<"ReservationHold"> | Date | string
    endTime?: DateTimeFilter<"ReservationHold"> | Date | string
    partySize?: IntFilter<"ReservationHold"> | number
    sessionId?: StringFilter<"ReservationHold"> | string
    expiresAt?: DateTimeFilter<"ReservationHold"> | Date | string
    createdAt?: DateTimeFilter<"ReservationHold"> | Date | string
  }

  export type VenueCreateWithoutFloorPlansInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venueGroup?: VenueGroupCreateNestedOneWithoutVenuesInput
    tables?: TableCreateNestedManyWithoutVenueInput
    reservations?: ReservationCreateNestedManyWithoutVenueInput
    guests?: GuestCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateWithoutFloorPlansInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutVenueInput
    reservations?: ReservationUncheckedCreateNestedManyWithoutVenueInput
    guests?: GuestUncheckedCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueCreateOrConnectWithoutFloorPlansInput = {
    where: VenueWhereUniqueInput
    create: XOR<VenueCreateWithoutFloorPlansInput, VenueUncheckedCreateWithoutFloorPlansInput>
  }

  export type TableCreateWithoutFloorPlanInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    venue?: VenueCreateNestedOneWithoutTablesInput
    reservations?: ReservationCreateNestedManyWithoutTableInput
    holds?: ReservationHoldCreateNestedManyWithoutTableInput
  }

  export type TableUncheckedCreateWithoutFloorPlanInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    venueId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutTableInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutTableInput
  }

  export type TableCreateOrConnectWithoutFloorPlanInput = {
    where: TableWhereUniqueInput
    create: XOR<TableCreateWithoutFloorPlanInput, TableUncheckedCreateWithoutFloorPlanInput>
  }

  export type TableCreateManyFloorPlanInputEnvelope = {
    data: TableCreateManyFloorPlanInput | TableCreateManyFloorPlanInput[]
    skipDuplicates?: boolean
  }

  export type VenueUpsertWithoutFloorPlansInput = {
    update: XOR<VenueUpdateWithoutFloorPlansInput, VenueUncheckedUpdateWithoutFloorPlansInput>
    create: XOR<VenueCreateWithoutFloorPlansInput, VenueUncheckedCreateWithoutFloorPlansInput>
    where?: VenueWhereInput
  }

  export type VenueUpdateToOneWithWhereWithoutFloorPlansInput = {
    where?: VenueWhereInput
    data: XOR<VenueUpdateWithoutFloorPlansInput, VenueUncheckedUpdateWithoutFloorPlansInput>
  }

  export type VenueUpdateWithoutFloorPlansInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venueGroup?: VenueGroupUpdateOneWithoutVenuesNestedInput
    tables?: TableUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUpdateManyWithoutVenueNestedInput
    guests?: GuestUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateWithoutFloorPlansInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUncheckedUpdateManyWithoutVenueNestedInput
    guests?: GuestUncheckedUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type TableUpsertWithWhereUniqueWithoutFloorPlanInput = {
    where: TableWhereUniqueInput
    update: XOR<TableUpdateWithoutFloorPlanInput, TableUncheckedUpdateWithoutFloorPlanInput>
    create: XOR<TableCreateWithoutFloorPlanInput, TableUncheckedCreateWithoutFloorPlanInput>
  }

  export type TableUpdateWithWhereUniqueWithoutFloorPlanInput = {
    where: TableWhereUniqueInput
    data: XOR<TableUpdateWithoutFloorPlanInput, TableUncheckedUpdateWithoutFloorPlanInput>
  }

  export type TableUpdateManyWithWhereWithoutFloorPlanInput = {
    where: TableScalarWhereInput
    data: XOR<TableUpdateManyMutationInput, TableUncheckedUpdateManyWithoutFloorPlanInput>
  }

  export type VenueCreateWithoutTablesInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venueGroup?: VenueGroupCreateNestedOneWithoutVenuesInput
    reservations?: ReservationCreateNestedManyWithoutVenueInput
    guests?: GuestCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateWithoutTablesInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutVenueInput
    guests?: GuestUncheckedCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanUncheckedCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueCreateOrConnectWithoutTablesInput = {
    where: VenueWhereUniqueInput
    create: XOR<VenueCreateWithoutTablesInput, VenueUncheckedCreateWithoutTablesInput>
  }

  export type FloorPlanCreateWithoutTablesInput = {
    id?: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    venue: VenueCreateNestedOneWithoutFloorPlansInput
  }

  export type FloorPlanUncheckedCreateWithoutTablesInput = {
    id?: string
    venueId: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FloorPlanCreateOrConnectWithoutTablesInput = {
    where: FloorPlanWhereUniqueInput
    create: XOR<FloorPlanCreateWithoutTablesInput, FloorPlanUncheckedCreateWithoutTablesInput>
  }

  export type ReservationCreateWithoutTableInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    guest?: GuestCreateNestedOneWithoutReservationsInput
    venue?: VenueCreateNestedOneWithoutReservationsInput
    deposit?: DepositCreateNestedOneWithoutReservationInput
  }

  export type ReservationUncheckedCreateWithoutTableInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    deposit?: DepositUncheckedCreateNestedOneWithoutReservationInput
  }

  export type ReservationCreateOrConnectWithoutTableInput = {
    where: ReservationWhereUniqueInput
    create: XOR<ReservationCreateWithoutTableInput, ReservationUncheckedCreateWithoutTableInput>
  }

  export type ReservationCreateManyTableInputEnvelope = {
    data: ReservationCreateManyTableInput | ReservationCreateManyTableInput[]
    skipDuplicates?: boolean
  }

  export type ReservationHoldCreateWithoutTableInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
    venue: VenueCreateNestedOneWithoutHoldsInput
  }

  export type ReservationHoldUncheckedCreateWithoutTableInput = {
    id?: string
    venueId: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
  }

  export type ReservationHoldCreateOrConnectWithoutTableInput = {
    where: ReservationHoldWhereUniqueInput
    create: XOR<ReservationHoldCreateWithoutTableInput, ReservationHoldUncheckedCreateWithoutTableInput>
  }

  export type ReservationHoldCreateManyTableInputEnvelope = {
    data: ReservationHoldCreateManyTableInput | ReservationHoldCreateManyTableInput[]
    skipDuplicates?: boolean
  }

  export type VenueUpsertWithoutTablesInput = {
    update: XOR<VenueUpdateWithoutTablesInput, VenueUncheckedUpdateWithoutTablesInput>
    create: XOR<VenueCreateWithoutTablesInput, VenueUncheckedCreateWithoutTablesInput>
    where?: VenueWhereInput
  }

  export type VenueUpdateToOneWithWhereWithoutTablesInput = {
    where?: VenueWhereInput
    data: XOR<VenueUpdateWithoutTablesInput, VenueUncheckedUpdateWithoutTablesInput>
  }

  export type VenueUpdateWithoutTablesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venueGroup?: VenueGroupUpdateOneWithoutVenuesNestedInput
    reservations?: ReservationUpdateManyWithoutVenueNestedInput
    guests?: GuestUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateWithoutTablesInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutVenueNestedInput
    guests?: GuestUncheckedUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUncheckedUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type FloorPlanUpsertWithoutTablesInput = {
    update: XOR<FloorPlanUpdateWithoutTablesInput, FloorPlanUncheckedUpdateWithoutTablesInput>
    create: XOR<FloorPlanCreateWithoutTablesInput, FloorPlanUncheckedCreateWithoutTablesInput>
    where?: FloorPlanWhereInput
  }

  export type FloorPlanUpdateToOneWithWhereWithoutTablesInput = {
    where?: FloorPlanWhereInput
    data: XOR<FloorPlanUpdateWithoutTablesInput, FloorPlanUncheckedUpdateWithoutTablesInput>
  }

  export type FloorPlanUpdateWithoutTablesInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneRequiredWithoutFloorPlansNestedInput
  }

  export type FloorPlanUncheckedUpdateWithoutTablesInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationUpsertWithWhereUniqueWithoutTableInput = {
    where: ReservationWhereUniqueInput
    update: XOR<ReservationUpdateWithoutTableInput, ReservationUncheckedUpdateWithoutTableInput>
    create: XOR<ReservationCreateWithoutTableInput, ReservationUncheckedCreateWithoutTableInput>
  }

  export type ReservationUpdateWithWhereUniqueWithoutTableInput = {
    where: ReservationWhereUniqueInput
    data: XOR<ReservationUpdateWithoutTableInput, ReservationUncheckedUpdateWithoutTableInput>
  }

  export type ReservationUpdateManyWithWhereWithoutTableInput = {
    where: ReservationScalarWhereInput
    data: XOR<ReservationUpdateManyMutationInput, ReservationUncheckedUpdateManyWithoutTableInput>
  }

  export type ReservationHoldUpsertWithWhereUniqueWithoutTableInput = {
    where: ReservationHoldWhereUniqueInput
    update: XOR<ReservationHoldUpdateWithoutTableInput, ReservationHoldUncheckedUpdateWithoutTableInput>
    create: XOR<ReservationHoldCreateWithoutTableInput, ReservationHoldUncheckedCreateWithoutTableInput>
  }

  export type ReservationHoldUpdateWithWhereUniqueWithoutTableInput = {
    where: ReservationHoldWhereUniqueInput
    data: XOR<ReservationHoldUpdateWithoutTableInput, ReservationHoldUncheckedUpdateWithoutTableInput>
  }

  export type ReservationHoldUpdateManyWithWhereWithoutTableInput = {
    where: ReservationHoldScalarWhereInput
    data: XOR<ReservationHoldUpdateManyMutationInput, ReservationHoldUncheckedUpdateManyWithoutTableInput>
  }

  export type VenueCreateWithoutGuestsInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venueGroup?: VenueGroupCreateNestedOneWithoutVenuesInput
    tables?: TableCreateNestedManyWithoutVenueInput
    reservations?: ReservationCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateWithoutGuestsInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutVenueInput
    reservations?: ReservationUncheckedCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanUncheckedCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueCreateOrConnectWithoutGuestsInput = {
    where: VenueWhereUniqueInput
    create: XOR<VenueCreateWithoutGuestsInput, VenueUncheckedCreateWithoutGuestsInput>
  }

  export type ReservationCreateWithoutGuestInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    table: TableCreateNestedOneWithoutReservationsInput
    venue?: VenueCreateNestedOneWithoutReservationsInput
    deposit?: DepositCreateNestedOneWithoutReservationInput
  }

  export type ReservationUncheckedCreateWithoutGuestInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    tableId: string
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    deposit?: DepositUncheckedCreateNestedOneWithoutReservationInput
  }

  export type ReservationCreateOrConnectWithoutGuestInput = {
    where: ReservationWhereUniqueInput
    create: XOR<ReservationCreateWithoutGuestInput, ReservationUncheckedCreateWithoutGuestInput>
  }

  export type ReservationCreateManyGuestInputEnvelope = {
    data: ReservationCreateManyGuestInput | ReservationCreateManyGuestInput[]
    skipDuplicates?: boolean
  }

  export type VenueUpsertWithoutGuestsInput = {
    update: XOR<VenueUpdateWithoutGuestsInput, VenueUncheckedUpdateWithoutGuestsInput>
    create: XOR<VenueCreateWithoutGuestsInput, VenueUncheckedCreateWithoutGuestsInput>
    where?: VenueWhereInput
  }

  export type VenueUpdateToOneWithWhereWithoutGuestsInput = {
    where?: VenueWhereInput
    data: XOR<VenueUpdateWithoutGuestsInput, VenueUncheckedUpdateWithoutGuestsInput>
  }

  export type VenueUpdateWithoutGuestsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venueGroup?: VenueGroupUpdateOneWithoutVenuesNestedInput
    tables?: TableUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateWithoutGuestsInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUncheckedUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUncheckedUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type ReservationUpsertWithWhereUniqueWithoutGuestInput = {
    where: ReservationWhereUniqueInput
    update: XOR<ReservationUpdateWithoutGuestInput, ReservationUncheckedUpdateWithoutGuestInput>
    create: XOR<ReservationCreateWithoutGuestInput, ReservationUncheckedCreateWithoutGuestInput>
  }

  export type ReservationUpdateWithWhereUniqueWithoutGuestInput = {
    where: ReservationWhereUniqueInput
    data: XOR<ReservationUpdateWithoutGuestInput, ReservationUncheckedUpdateWithoutGuestInput>
  }

  export type ReservationUpdateManyWithWhereWithoutGuestInput = {
    where: ReservationScalarWhereInput
    data: XOR<ReservationUpdateManyMutationInput, ReservationUncheckedUpdateManyWithoutGuestInput>
  }

  export type GuestCreateWithoutReservationsInput = {
    id?: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venue: VenueCreateNestedOneWithoutGuestsInput
  }

  export type GuestUncheckedCreateWithoutReservationsInput = {
    id?: string
    venueId: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GuestCreateOrConnectWithoutReservationsInput = {
    where: GuestWhereUniqueInput
    create: XOR<GuestCreateWithoutReservationsInput, GuestUncheckedCreateWithoutReservationsInput>
  }

  export type TableCreateWithoutReservationsInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    venue?: VenueCreateNestedOneWithoutTablesInput
    floorPlan?: FloorPlanCreateNestedOneWithoutTablesInput
    holds?: ReservationHoldCreateNestedManyWithoutTableInput
  }

  export type TableUncheckedCreateWithoutReservationsInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    venueId?: string | null
    floorPlanId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutTableInput
  }

  export type TableCreateOrConnectWithoutReservationsInput = {
    where: TableWhereUniqueInput
    create: XOR<TableCreateWithoutReservationsInput, TableUncheckedCreateWithoutReservationsInput>
  }

  export type VenueCreateWithoutReservationsInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venueGroup?: VenueGroupCreateNestedOneWithoutVenuesInput
    tables?: TableCreateNestedManyWithoutVenueInput
    guests?: GuestCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateWithoutReservationsInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutVenueInput
    guests?: GuestUncheckedCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanUncheckedCreateNestedManyWithoutVenueInput
    holds?: ReservationHoldUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueCreateOrConnectWithoutReservationsInput = {
    where: VenueWhereUniqueInput
    create: XOR<VenueCreateWithoutReservationsInput, VenueUncheckedCreateWithoutReservationsInput>
  }

  export type DepositCreateWithoutReservationInput = {
    id?: string
    amountCents: number
    currency?: string
    status?: $Enums.DepositStatus
    stripePaymentIntentId?: string | null
    stripeCustomerId?: string | null
    heldAt?: Date | string | null
    appliedAt?: Date | string | null
    refundedAt?: Date | string | null
    forfeitedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type DepositUncheckedCreateWithoutReservationInput = {
    id?: string
    amountCents: number
    currency?: string
    status?: $Enums.DepositStatus
    stripePaymentIntentId?: string | null
    stripeCustomerId?: string | null
    heldAt?: Date | string | null
    appliedAt?: Date | string | null
    refundedAt?: Date | string | null
    forfeitedAt?: Date | string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type DepositCreateOrConnectWithoutReservationInput = {
    where: DepositWhereUniqueInput
    create: XOR<DepositCreateWithoutReservationInput, DepositUncheckedCreateWithoutReservationInput>
  }

  export type GuestUpsertWithoutReservationsInput = {
    update: XOR<GuestUpdateWithoutReservationsInput, GuestUncheckedUpdateWithoutReservationsInput>
    create: XOR<GuestCreateWithoutReservationsInput, GuestUncheckedCreateWithoutReservationsInput>
    where?: GuestWhereInput
  }

  export type GuestUpdateToOneWithWhereWithoutReservationsInput = {
    where?: GuestWhereInput
    data: XOR<GuestUpdateWithoutReservationsInput, GuestUncheckedUpdateWithoutReservationsInput>
  }

  export type GuestUpdateWithoutReservationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneRequiredWithoutGuestsNestedInput
  }

  export type GuestUncheckedUpdateWithoutReservationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TableUpsertWithoutReservationsInput = {
    update: XOR<TableUpdateWithoutReservationsInput, TableUncheckedUpdateWithoutReservationsInput>
    create: XOR<TableCreateWithoutReservationsInput, TableUncheckedCreateWithoutReservationsInput>
    where?: TableWhereInput
  }

  export type TableUpdateToOneWithWhereWithoutReservationsInput = {
    where?: TableWhereInput
    data: XOR<TableUpdateWithoutReservationsInput, TableUncheckedUpdateWithoutReservationsInput>
  }

  export type TableUpdateWithoutReservationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneWithoutTablesNestedInput
    floorPlan?: FloorPlanUpdateOneWithoutTablesNestedInput
    holds?: ReservationHoldUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateWithoutReservationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    floorPlanId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    holds?: ReservationHoldUncheckedUpdateManyWithoutTableNestedInput
  }

  export type VenueUpsertWithoutReservationsInput = {
    update: XOR<VenueUpdateWithoutReservationsInput, VenueUncheckedUpdateWithoutReservationsInput>
    create: XOR<VenueCreateWithoutReservationsInput, VenueUncheckedCreateWithoutReservationsInput>
    where?: VenueWhereInput
  }

  export type VenueUpdateToOneWithWhereWithoutReservationsInput = {
    where?: VenueWhereInput
    data: XOR<VenueUpdateWithoutReservationsInput, VenueUncheckedUpdateWithoutReservationsInput>
  }

  export type VenueUpdateWithoutReservationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venueGroup?: VenueGroupUpdateOneWithoutVenuesNestedInput
    tables?: TableUpdateManyWithoutVenueNestedInput
    guests?: GuestUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateWithoutReservationsInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutVenueNestedInput
    guests?: GuestUncheckedUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUncheckedUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type DepositUpsertWithoutReservationInput = {
    update: XOR<DepositUpdateWithoutReservationInput, DepositUncheckedUpdateWithoutReservationInput>
    create: XOR<DepositCreateWithoutReservationInput, DepositUncheckedCreateWithoutReservationInput>
    where?: DepositWhereInput
  }

  export type DepositUpdateToOneWithWhereWithoutReservationInput = {
    where?: DepositWhereInput
    data: XOR<DepositUpdateWithoutReservationInput, DepositUncheckedUpdateWithoutReservationInput>
  }

  export type DepositUpdateWithoutReservationInput = {
    id?: StringFieldUpdateOperationsInput | string
    amountCents?: IntFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    stripePaymentIntentId?: NullableStringFieldUpdateOperationsInput | string | null
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    heldAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    appliedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    refundedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    forfeitedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type DepositUncheckedUpdateWithoutReservationInput = {
    id?: StringFieldUpdateOperationsInput | string
    amountCents?: IntFieldUpdateOperationsInput | number
    currency?: StringFieldUpdateOperationsInput | string
    status?: EnumDepositStatusFieldUpdateOperationsInput | $Enums.DepositStatus
    stripePaymentIntentId?: NullableStringFieldUpdateOperationsInput | string | null
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    heldAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    appliedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    refundedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    forfeitedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationCreateWithoutDepositInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
    guest?: GuestCreateNestedOneWithoutReservationsInput
    table: TableCreateNestedOneWithoutReservationsInput
    venue?: VenueCreateNestedOneWithoutReservationsInput
  }

  export type ReservationUncheckedCreateWithoutDepositInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    tableId: string
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ReservationCreateOrConnectWithoutDepositInput = {
    where: ReservationWhereUniqueInput
    create: XOR<ReservationCreateWithoutDepositInput, ReservationUncheckedCreateWithoutDepositInput>
  }

  export type ReservationUpsertWithoutDepositInput = {
    update: XOR<ReservationUpdateWithoutDepositInput, ReservationUncheckedUpdateWithoutDepositInput>
    create: XOR<ReservationCreateWithoutDepositInput, ReservationUncheckedCreateWithoutDepositInput>
    where?: ReservationWhereInput
  }

  export type ReservationUpdateToOneWithWhereWithoutDepositInput = {
    where?: ReservationWhereInput
    data: XOR<ReservationUpdateWithoutDepositInput, ReservationUncheckedUpdateWithoutDepositInput>
  }

  export type ReservationUpdateWithoutDepositInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    guest?: GuestUpdateOneWithoutReservationsNestedInput
    table?: TableUpdateOneRequiredWithoutReservationsNestedInput
    venue?: VenueUpdateOneWithoutReservationsNestedInput
  }

  export type ReservationUncheckedUpdateWithoutDepositInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type VenueCreateWithoutHoldsInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    venueGroup?: VenueGroupCreateNestedOneWithoutVenuesInput
    tables?: TableCreateNestedManyWithoutVenueInput
    reservations?: ReservationCreateNestedManyWithoutVenueInput
    guests?: GuestCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanCreateNestedManyWithoutVenueInput
  }

  export type VenueUncheckedCreateWithoutHoldsInput = {
    id?: string
    venueGroupId?: string | null
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
    tables?: TableUncheckedCreateNestedManyWithoutVenueInput
    reservations?: ReservationUncheckedCreateNestedManyWithoutVenueInput
    guests?: GuestUncheckedCreateNestedManyWithoutVenueInput
    floorPlans?: FloorPlanUncheckedCreateNestedManyWithoutVenueInput
  }

  export type VenueCreateOrConnectWithoutHoldsInput = {
    where: VenueWhereUniqueInput
    create: XOR<VenueCreateWithoutHoldsInput, VenueUncheckedCreateWithoutHoldsInput>
  }

  export type TableCreateWithoutHoldsInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    venue?: VenueCreateNestedOneWithoutTablesInput
    floorPlan?: FloorPlanCreateNestedOneWithoutTablesInput
    reservations?: ReservationCreateNestedManyWithoutTableInput
  }

  export type TableUncheckedCreateWithoutHoldsInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    venueId?: string | null
    floorPlanId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
    reservations?: ReservationUncheckedCreateNestedManyWithoutTableInput
  }

  export type TableCreateOrConnectWithoutHoldsInput = {
    where: TableWhereUniqueInput
    create: XOR<TableCreateWithoutHoldsInput, TableUncheckedCreateWithoutHoldsInput>
  }

  export type VenueUpsertWithoutHoldsInput = {
    update: XOR<VenueUpdateWithoutHoldsInput, VenueUncheckedUpdateWithoutHoldsInput>
    create: XOR<VenueCreateWithoutHoldsInput, VenueUncheckedCreateWithoutHoldsInput>
    where?: VenueWhereInput
  }

  export type VenueUpdateToOneWithWhereWithoutHoldsInput = {
    where?: VenueWhereInput
    data: XOR<VenueUpdateWithoutHoldsInput, VenueUncheckedUpdateWithoutHoldsInput>
  }

  export type VenueUpdateWithoutHoldsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venueGroup?: VenueGroupUpdateOneWithoutVenuesNestedInput
    tables?: TableUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUpdateManyWithoutVenueNestedInput
    guests?: GuestUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateWithoutHoldsInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueGroupId?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUncheckedUpdateManyWithoutVenueNestedInput
    guests?: GuestUncheckedUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type TableUpsertWithoutHoldsInput = {
    update: XOR<TableUpdateWithoutHoldsInput, TableUncheckedUpdateWithoutHoldsInput>
    create: XOR<TableCreateWithoutHoldsInput, TableUncheckedCreateWithoutHoldsInput>
    where?: TableWhereInput
  }

  export type TableUpdateToOneWithWhereWithoutHoldsInput = {
    where?: TableWhereInput
    data: XOR<TableUpdateWithoutHoldsInput, TableUncheckedUpdateWithoutHoldsInput>
  }

  export type TableUpdateWithoutHoldsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneWithoutTablesNestedInput
    floorPlan?: FloorPlanUpdateOneWithoutTablesNestedInput
    reservations?: ReservationUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateWithoutHoldsInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    floorPlanId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutTableNestedInput
  }

  export type VenueCreateManyVenueGroupInput = {
    id?: string
    name: string
    slug: string
    ianaTimezone: string
    currencyCode?: string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: boolean
    depositType?: $Enums.DepositType | null
    depositAmountCents?: number | null
    freeCancellationHours?: number | null
    lateCancellationFeePercent?: number | null
    noShowFeePercent?: number | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type VenueUpdateWithoutVenueGroupInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUpdateManyWithoutVenueNestedInput
    guests?: GuestUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateWithoutVenueGroupInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutVenueNestedInput
    reservations?: ReservationUncheckedUpdateManyWithoutVenueNestedInput
    guests?: GuestUncheckedUpdateManyWithoutVenueNestedInput
    floorPlans?: FloorPlanUncheckedUpdateManyWithoutVenueNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutVenueNestedInput
  }

  export type VenueUncheckedUpdateManyWithoutVenueGroupInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    slug?: StringFieldUpdateOperationsInput | string
    ianaTimezone?: StringFieldUpdateOperationsInput | string
    currencyCode?: StringFieldUpdateOperationsInput | string
    operatingHours?: NullableJsonNullValueInput | InputJsonValue
    settings?: NullableJsonNullValueInput | InputJsonValue
    depositEnabled?: BoolFieldUpdateOperationsInput | boolean
    depositType?: NullableEnumDepositTypeFieldUpdateOperationsInput | $Enums.DepositType | null
    depositAmountCents?: NullableIntFieldUpdateOperationsInput | number | null
    freeCancellationHours?: NullableIntFieldUpdateOperationsInput | number | null
    lateCancellationFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    noShowFeePercent?: NullableIntFieldUpdateOperationsInput | number | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TableCreateManyVenueInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    floorPlanId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ReservationCreateManyVenueInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    tableId: string
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type GuestCreateManyVenueInput = {
    id?: string
    email?: string | null
    phone?: string | null
    name: string
    notes?: string | null
    visitCount?: number
    lifetimeSpend?: Decimal | DecimalJsLike | number | string | null
    lastVisit?: Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: $Enums.CommunicationPreference
    stripeCustomerId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type FloorPlanCreateManyVenueInput = {
    id?: string
    name: string
    isActive?: boolean
    layoutJson: JsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ReservationHoldCreateManyVenueInput = {
    id?: string
    tableId: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
  }

  export type TableUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    floorPlan?: FloorPlanUpdateOneWithoutTablesNestedInput
    reservations?: ReservationUpdateManyWithoutTableNestedInput
    holds?: ReservationHoldUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    floorPlanId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutTableNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateManyWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    floorPlanId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    guest?: GuestUpdateOneWithoutReservationsNestedInput
    table?: TableUpdateOneRequiredWithoutReservationsNestedInput
    deposit?: DepositUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deposit?: DepositUncheckedUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateManyWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type GuestUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUpdateManyWithoutGuestNestedInput
  }

  export type GuestUncheckedUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutGuestNestedInput
  }

  export type GuestUncheckedUpdateManyWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    email?: NullableStringFieldUpdateOperationsInput | string | null
    phone?: NullableStringFieldUpdateOperationsInput | string | null
    name?: StringFieldUpdateOperationsInput | string
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    visitCount?: IntFieldUpdateOperationsInput | number
    lifetimeSpend?: NullableDecimalFieldUpdateOperationsInput | Decimal | DecimalJsLike | number | string | null
    lastVisit?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null
    tags?: NullableJsonNullValueInput | InputJsonValue
    dietaryRestrictions?: NullableJsonNullValueInput | InputJsonValue
    staffNotes?: NullableJsonNullValueInput | InputJsonValue
    communicationPreference?: EnumCommunicationPreferenceFieldUpdateOperationsInput | $Enums.CommunicationPreference
    stripeCustomerId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type FloorPlanUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUpdateManyWithoutFloorPlanNestedInput
  }

  export type FloorPlanUncheckedUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    tables?: TableUncheckedUpdateManyWithoutFloorPlanNestedInput
  }

  export type FloorPlanUncheckedUpdateManyWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    isActive?: BoolFieldUpdateOperationsInput | boolean
    layoutJson?: JsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    table?: TableUpdateOneRequiredWithoutHoldsNestedInput
  }

  export type ReservationHoldUncheckedUpdateWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldUncheckedUpdateManyWithoutVenueInput = {
    id?: StringFieldUpdateOperationsInput | string
    tableId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type TableCreateManyFloorPlanInput = {
    id?: string
    name: string
    tableNumber?: string | null
    capacity: number
    minCovers?: number
    maxCovers?: number | null
    location?: string | null
    isActive?: boolean
    status?: $Enums.TableStatus
    priority?: number
    venueId?: string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type TableUpdateWithoutFloorPlanInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneWithoutTablesNestedInput
    reservations?: ReservationUpdateManyWithoutTableNestedInput
    holds?: ReservationHoldUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateWithoutFloorPlanInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    reservations?: ReservationUncheckedUpdateManyWithoutTableNestedInput
    holds?: ReservationHoldUncheckedUpdateManyWithoutTableNestedInput
  }

  export type TableUncheckedUpdateManyWithoutFloorPlanInput = {
    id?: StringFieldUpdateOperationsInput | string
    name?: StringFieldUpdateOperationsInput | string
    tableNumber?: NullableStringFieldUpdateOperationsInput | string | null
    capacity?: IntFieldUpdateOperationsInput | number
    minCovers?: IntFieldUpdateOperationsInput | number
    maxCovers?: NullableIntFieldUpdateOperationsInput | number | null
    location?: NullableStringFieldUpdateOperationsInput | string | null
    isActive?: BoolFieldUpdateOperationsInput | boolean
    status?: EnumTableStatusFieldUpdateOperationsInput | $Enums.TableStatus
    priority?: IntFieldUpdateOperationsInput | number
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    shapeMetadata?: NullableJsonNullValueInput | InputJsonValue
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationCreateManyTableInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    guestId?: string | null
    userId?: string | null
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ReservationHoldCreateManyTableInput = {
    id?: string
    venueId: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    sessionId: string
    expiresAt: Date | string
    createdAt?: Date | string
  }

  export type ReservationUpdateWithoutTableInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    guest?: GuestUpdateOneWithoutReservationsNestedInput
    venue?: VenueUpdateOneWithoutReservationsNestedInput
    deposit?: DepositUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateWithoutTableInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deposit?: DepositUncheckedUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateManyWithoutTableInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    guestId?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldUpdateWithoutTableInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    venue?: VenueUpdateOneRequiredWithoutHoldsNestedInput
  }

  export type ReservationHoldUncheckedUpdateWithoutTableInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationHoldUncheckedUpdateManyWithoutTableInput = {
    id?: StringFieldUpdateOperationsInput | string
    venueId?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    sessionId?: StringFieldUpdateOperationsInput | string
    expiresAt?: DateTimeFieldUpdateOperationsInput | Date | string
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type ReservationCreateManyGuestInput = {
    id?: string
    date: Date | string
    startTime: Date | string
    endTime: Date | string
    partySize: number
    status?: $Enums.ReservationStatus
    notes?: string | null
    cancellationReason?: string | null
    cancellationNote?: string | null
    occasion?: $Enums.Occasion | null
    seatingPreference?: $Enums.SeatingPreference | null
    guestName?: string | null
    guestEmail?: string | null
    guestPhone?: string | null
    userId?: string | null
    tableId: string
    venueId?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type ReservationUpdateWithoutGuestInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    table?: TableUpdateOneRequiredWithoutReservationsNestedInput
    venue?: VenueUpdateOneWithoutReservationsNestedInput
    deposit?: DepositUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateWithoutGuestInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
    deposit?: DepositUncheckedUpdateOneWithoutReservationNestedInput
  }

  export type ReservationUncheckedUpdateManyWithoutGuestInput = {
    id?: StringFieldUpdateOperationsInput | string
    date?: DateTimeFieldUpdateOperationsInput | Date | string
    startTime?: DateTimeFieldUpdateOperationsInput | Date | string
    endTime?: DateTimeFieldUpdateOperationsInput | Date | string
    partySize?: IntFieldUpdateOperationsInput | number
    status?: EnumReservationStatusFieldUpdateOperationsInput | $Enums.ReservationStatus
    notes?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationReason?: NullableStringFieldUpdateOperationsInput | string | null
    cancellationNote?: NullableStringFieldUpdateOperationsInput | string | null
    occasion?: NullableEnumOccasionFieldUpdateOperationsInput | $Enums.Occasion | null
    seatingPreference?: NullableEnumSeatingPreferenceFieldUpdateOperationsInput | $Enums.SeatingPreference | null
    guestName?: NullableStringFieldUpdateOperationsInput | string | null
    guestEmail?: NullableStringFieldUpdateOperationsInput | string | null
    guestPhone?: NullableStringFieldUpdateOperationsInput | string | null
    userId?: NullableStringFieldUpdateOperationsInput | string | null
    tableId?: StringFieldUpdateOperationsInput | string
    venueId?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }



  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}