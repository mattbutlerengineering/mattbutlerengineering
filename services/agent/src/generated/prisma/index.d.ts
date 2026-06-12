/**
 * Client
 **/

import * as runtime from "./runtime/client.js";
import $Types = runtime.Types; // general types
import $Public = runtime.Types.Public;
import $Utils = runtime.Types.Utils;
import $Extensions = runtime.Types.Extensions;
import $Result = runtime.Types.Result;

export type PrismaPromise<T> = $Public.PrismaPromise<T>;

/**
 * Model Session
 *
 */
export type Session = $Result.DefaultSelection<Prisma.$SessionPayload>;
/**
 * Model SessionEvent
 *
 */
export type SessionEvent = $Result.DefaultSelection<Prisma.$SessionEventPayload>;
/**
 * Model StoredSpec
 *
 */
export type StoredSpec = $Result.DefaultSelection<Prisma.$StoredSpecPayload>;

/**
 * Enums
 */
export namespace $Enums {
  export const SessionStatus: {
    PENDING: "PENDING";
    RUNNING: "RUNNING";
    SUCCEEDED: "SUCCEEDED";
    FAILED: "FAILED";
    CANCELLED: "CANCELLED";
  };

  export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];
}

export type SessionStatus = $Enums.SessionStatus;

export const SessionStatus: typeof $Enums.SessionStatus;

/**
 * ##  Prisma Client ʲˢ
 *
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient({
 *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
 * })
 * // Fetch zero or more Sessions
 * const sessions = await prisma.session.findMany()
 * ```
 *
 *
 * Read more in our [docs](https://pris.ly/d/client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  const U = "log" extends keyof ClientOptions
    ? ClientOptions["log"] extends Array<Prisma.LogLevel | Prisma.LogDefinition>
      ? Prisma.GetEvents<ClientOptions["log"]>
      : never
    : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>["other"] };

  /**
   * ##  Prisma Client ʲˢ
   *
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient({
   *   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
   * })
   * // Fetch zero or more Sessions
   * const sessions = await prisma.session.findMany()
   * ```
   *
   *
   * Read more in our [docs](https://pris.ly/d/client).
   */

  constructor(optionsArg?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(
    eventType: V,
    callback: (event: V extends "query" ? Prisma.QueryEvent : Prisma.LogEvent) => void
  ): PrismaClient;

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
  $executeRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Prisma.PrismaPromise<number>;

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
  $queryRaw<T = unknown>(
    query: TemplateStringsArray | Prisma.Sql,
    ...values: any[]
  ): Prisma.PrismaPromise<T>;

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
  $transaction<P extends Prisma.PrismaPromise<any>[]>(
    arg: [...P],
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>;

  $transaction<R>(
    fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): $Utils.JsPromise<R>;

  $extends: $Extensions.ExtendsHook<
    "extends",
    Prisma.TypeMapCb<ClientOptions>,
    ExtArgs,
    $Utils.Call<
      Prisma.TypeMapCb<ClientOptions>,
      {
        extArgs: ExtArgs;
      }
    >
  >;

  /**
   * `prisma.session`: Exposes CRUD operations for the **Session** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more Sessions
   * const sessions = await prisma.session.findMany()
   * ```
   */
  get session(): Prisma.SessionDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.sessionEvent`: Exposes CRUD operations for the **SessionEvent** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more SessionEvents
   * const sessionEvents = await prisma.sessionEvent.findMany()
   * ```
   */
  get sessionEvent(): Prisma.SessionEventDelegate<ExtArgs, ClientOptions>;

  /**
   * `prisma.storedSpec`: Exposes CRUD operations for the **StoredSpec** model.
   * Example usage:
   * ```ts
   * // Fetch zero or more StoredSpecs
   * const storedSpecs = await prisma.storedSpec.findMany()
   * ```
   */
  get storedSpec(): Prisma.StoredSpecDelegate<ExtArgs, ClientOptions>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF;

  export type PrismaPromise<T> = $Public.PrismaPromise<T>;

  /**
   * Validator
   */
  export import validator = runtime.Public.validator;

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError;
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError;
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError;
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError;
  export import PrismaClientValidationError = runtime.PrismaClientValidationError;

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag;
  export import empty = runtime.empty;
  export import join = runtime.join;
  export import raw = runtime.raw;
  export import Sql = runtime.Sql;

  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal;

  export type DecimalJsLike = runtime.DecimalJsLike;

  /**
   * Extensions
   */
  export import Extension = $Extensions.UserArgs;
  export import getExtensionContext = runtime.Extensions.getExtensionContext;
  export import Args = $Public.Args;
  export import Payload = $Public.Payload;
  export import Result = $Public.Result;
  export import Exact = $Public.Exact;

  /**
   * Prisma Client JS version: 7.8.0
   * Query Engine version: 3c6e192761c0362d496ed980de936e2f3cebcd3a
   */
  export type PrismaVersion = {
    client: string;
    engine: string;
  };

  export const prismaVersion: PrismaVersion;

  /**
   * Utility Types
   */

  export import Bytes = runtime.Bytes;
  export import JsonObject = runtime.JsonObject;
  export import JsonArray = runtime.JsonArray;
  export import JsonValue = runtime.JsonValue;
  export import InputJsonObject = runtime.InputJsonObject;
  export import InputJsonArray = runtime.InputJsonArray;
  export import InputJsonValue = runtime.InputJsonValue;

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
      private DbNull: never;
      private constructor();
    }

    /**
     * Type of `Prisma.JsonNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class JsonNull {
      private JsonNull: never;
      private constructor();
    }

    /**
     * Type of `Prisma.AnyNull`.
     *
     * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
     *
     * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
     */
    class AnyNull {
      private AnyNull: never;
      private constructor();
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull;

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull;

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   *
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull;

  type SelectAndInclude = {
    select: any;
    include: any;
  };

  type SelectAndOmit = {
    select: any;
    omit: any;
  };

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<
    ReturnType<T>
  >;

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
    [P in K]: T[P];
  };

  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K;
  }[keyof T];

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K;
  };

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>;

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
    [key in keyof T]: key extends keyof U ? T[key] : never;
  } & (T extends SelectAndInclude
    ? "Please either choose `select` or `include`."
    : T extends SelectAndOmit
      ? "Please either choose `select` or `omit`."
      : {});

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  } & K;

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> = T extends object
    ? U extends object
      ? (Without<T, U> & U) | (Without<U, T> & T)
      : U
    : T;

  /**
   * Is T a Record?
   */
  type IsObject<T extends any> =
    T extends Array<any>
      ? False
      : T extends Date
        ? False
        : T extends Uint8Array
          ? False
          : T extends BigInt
            ? False
            : T extends object
              ? True
              : False;

  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T;

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O>; // With K possibilities
    }[K];

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>;

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>;

  type _Either<O extends object, K extends Key, strict extends Boolean> = {
    1: EitherStrict<O, K>;
    0: EitherLoose<O, K>;
  }[strict];

  type Either<O extends object, K extends Key, strict extends Boolean = 1> = O extends unknown
    ? _Either<O, K, strict>
    : never;

  export type Union = any;

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K];
  } & {};

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (U extends unknown ? (k: U) => void : never) extends (
    k: infer I
  ) => void
    ? I
    : never;

  export type Overwrite<O extends object, O1 extends object> = {
    [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<
    Overwrite<
      U,
      {
        [K in keyof U]-?: At<U, K>;
      }
    >
  >;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
    1: AtStrict<O, K>;
    0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function
    ? A
    : {
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
      ?
          | (K extends keyof O ? { [P in K]: O[P] } & O : O)
          | ({ [P in keyof O as P extends K ? P : never]-?: O[P] } & O)
      : never
  >;

  type _Strict<U, _U = U> = U extends unknown
    ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>>
    : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False;

  // /**
  // 1
  // */
  export type True = 1;

  /**
  0
  */
  export type False = 0;

  export type Not<B extends Boolean> = {
    0: 1;
    1: 0;
  }[B];

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
      ? 1
      : 0;

  export type Has<U extends Union, U1 extends Union> = Not<Extends<Exclude<U1, U>, U1>>;

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0;
      1: 1;
    };
    1: {
      0: 1;
      1: 1;
    };
  }[B1][B2];

  export type Keys<U extends Union> = U extends unknown ? keyof U : never;

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;

  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object
    ? {
        [P in keyof T]: P extends keyof O ? O[P] : never;
      }
    : never;

  type FieldPaths<T, U = Omit<T, "_avg" | "_sum" | "_count" | "_min" | "_max">> =
    IsObject<T> extends True ? U : T;

  type GetHavingFields<T> = {
    [K in keyof T]: Or<Or<Extends<"OR", K>, Extends<"AND", K>>, Extends<"NOT", K>> extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
        ? never
        : K;
  }[keyof T];

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never;
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>;
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T;

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<
    T,
    MaybeTupleToUnion<K>
  >;

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T;

  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>;

  type FieldRefInputType<Model, FieldType> = Model extends never
    ? never
    : FieldRef<Model, FieldType>;

  export const ModelName: {
    Session: "Session";
    SessionEvent: "SessionEvent";
    StoredSpec: "StoredSpec";
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName];

  interface TypeMapCb<ClientOptions = {}> extends $Utils.Fn<
    { extArgs: $Extensions.InternalArgs },
    $Utils.Record<string, any>
  > {
    returns: Prisma.TypeMap<
      this["params"]["extArgs"],
      ClientOptions extends { omit: infer OmitOptions } ? OmitOptions : {}
    >;
  }

  export type TypeMap<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > = {
    globalOmitOptions: {
      omit: GlobalOmitOptions;
    };
    meta: {
      modelProps: "session" | "sessionEvent" | "storedSpec";
      txIsolationLevel: Prisma.TransactionIsolationLevel;
    };
    model: {
      Session: {
        payload: Prisma.$SessionPayload<ExtArgs>;
        fields: Prisma.SessionFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.SessionFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.SessionFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>;
          };
          findFirst: {
            args: Prisma.SessionFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.SessionFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>;
          };
          findMany: {
            args: Prisma.SessionFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>[];
          };
          create: {
            args: Prisma.SessionCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>;
          };
          createMany: {
            args: Prisma.SessionCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.SessionCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>[];
          };
          delete: {
            args: Prisma.SessionDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>;
          };
          update: {
            args: Prisma.SessionUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>;
          };
          deleteMany: {
            args: Prisma.SessionDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.SessionUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateManyAndReturn: {
            args: Prisma.SessionUpdateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>[];
          };
          upsert: {
            args: Prisma.SessionUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionPayload>;
          };
          aggregate: {
            args: Prisma.SessionAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateSession>;
          };
          groupBy: {
            args: Prisma.SessionGroupByArgs<ExtArgs>;
            result: $Utils.Optional<SessionGroupByOutputType>[];
          };
          count: {
            args: Prisma.SessionCountArgs<ExtArgs>;
            result: $Utils.Optional<SessionCountAggregateOutputType> | number;
          };
        };
      };
      SessionEvent: {
        payload: Prisma.$SessionEventPayload<ExtArgs>;
        fields: Prisma.SessionEventFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.SessionEventFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.SessionEventFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>;
          };
          findFirst: {
            args: Prisma.SessionEventFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.SessionEventFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>;
          };
          findMany: {
            args: Prisma.SessionEventFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>[];
          };
          create: {
            args: Prisma.SessionEventCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>;
          };
          createMany: {
            args: Prisma.SessionEventCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.SessionEventCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>[];
          };
          delete: {
            args: Prisma.SessionEventDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>;
          };
          update: {
            args: Prisma.SessionEventUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>;
          };
          deleteMany: {
            args: Prisma.SessionEventDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.SessionEventUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateManyAndReturn: {
            args: Prisma.SessionEventUpdateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>[];
          };
          upsert: {
            args: Prisma.SessionEventUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$SessionEventPayload>;
          };
          aggregate: {
            args: Prisma.SessionEventAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateSessionEvent>;
          };
          groupBy: {
            args: Prisma.SessionEventGroupByArgs<ExtArgs>;
            result: $Utils.Optional<SessionEventGroupByOutputType>[];
          };
          count: {
            args: Prisma.SessionEventCountArgs<ExtArgs>;
            result: $Utils.Optional<SessionEventCountAggregateOutputType> | number;
          };
        };
      };
      StoredSpec: {
        payload: Prisma.$StoredSpecPayload<ExtArgs>;
        fields: Prisma.StoredSpecFieldRefs;
        operations: {
          findUnique: {
            args: Prisma.StoredSpecFindUniqueArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload> | null;
          };
          findUniqueOrThrow: {
            args: Prisma.StoredSpecFindUniqueOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>;
          };
          findFirst: {
            args: Prisma.StoredSpecFindFirstArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload> | null;
          };
          findFirstOrThrow: {
            args: Prisma.StoredSpecFindFirstOrThrowArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>;
          };
          findMany: {
            args: Prisma.StoredSpecFindManyArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>[];
          };
          create: {
            args: Prisma.StoredSpecCreateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>;
          };
          createMany: {
            args: Prisma.StoredSpecCreateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          createManyAndReturn: {
            args: Prisma.StoredSpecCreateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>[];
          };
          delete: {
            args: Prisma.StoredSpecDeleteArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>;
          };
          update: {
            args: Prisma.StoredSpecUpdateArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>;
          };
          deleteMany: {
            args: Prisma.StoredSpecDeleteManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateMany: {
            args: Prisma.StoredSpecUpdateManyArgs<ExtArgs>;
            result: BatchPayload;
          };
          updateManyAndReturn: {
            args: Prisma.StoredSpecUpdateManyAndReturnArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>[];
          };
          upsert: {
            args: Prisma.StoredSpecUpsertArgs<ExtArgs>;
            result: $Utils.PayloadToResult<Prisma.$StoredSpecPayload>;
          };
          aggregate: {
            args: Prisma.StoredSpecAggregateArgs<ExtArgs>;
            result: $Utils.Optional<AggregateStoredSpec>;
          };
          groupBy: {
            args: Prisma.StoredSpecGroupByArgs<ExtArgs>;
            result: $Utils.Optional<StoredSpecGroupByOutputType>[];
          };
          count: {
            args: Prisma.StoredSpecCountArgs<ExtArgs>;
            result: $Utils.Optional<StoredSpecCountAggregateOutputType> | number;
          };
        };
      };
    };
  } & {
    other: {
      payload: any;
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]];
          result: any;
        };
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]];
          result: any;
        };
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]];
          result: any;
        };
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]];
          result: any;
        };
      };
    };
  };
  export const defineExtension: $Extensions.ExtendsHook<
    "define",
    Prisma.TypeMapCb,
    $Extensions.DefaultArgs
  >;
  export type DefaultPrismaClient = PrismaClient;
  export type ErrorFormat = "pretty" | "colorless" | "minimal";
  export interface PrismaClientOptions {
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat;
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
    log?: (LogLevel | LogDefinition)[];
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    };
    /**
     * Instance of a Driver Adapter, e.g., like one provided by `@prisma/adapter-planetscale`
     */
    adapter?: runtime.SqlDriverAdapterFactory;
    /**
     * Prisma Accelerate URL allowing the client to connect through Accelerate instead of a direct database.
     */
    accelerateUrl?: string;
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
    omit?: Prisma.GlobalOmitConfig;
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
    comments?: runtime.SqlCommenterPlugin[];
  }
  export type GlobalOmitConfig = {
    session?: SessionOmit;
    sessionEvent?: SessionEventOmit;
    storedSpec?: StoredSpecOmit;
  };

  /* Types for Logging */
  export type LogLevel = "info" | "query" | "warn" | "error";
  export type LogDefinition = {
    level: LogLevel;
    emit: "stdout" | "event";
  };

  export type CheckIsLogLevel<T> = T extends LogLevel ? T : never;

  export type GetLogType<T> = CheckIsLogLevel<T extends LogDefinition ? T["level"] : T>;

  export type GetEvents<T extends any[]> =
    T extends Array<LogLevel | LogDefinition> ? GetLogType<T[number]> : never;

  export type QueryEvent = {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
  };

  export type LogEvent = {
    timestamp: Date;
    message: string;
    target: string;
  };
  /* End Types for Logging */

  export type PrismaAction =
    | "findUnique"
    | "findUniqueOrThrow"
    | "findMany"
    | "findFirst"
    | "findFirstOrThrow"
    | "create"
    | "createMany"
    | "createManyAndReturn"
    | "update"
    | "updateMany"
    | "updateManyAndReturn"
    | "upsert"
    | "delete"
    | "deleteMany"
    | "executeRaw"
    | "queryRaw"
    | "aggregate"
    | "count"
    | "runCommandRaw"
    | "findRaw"
    | "groupBy";

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>;

  export type Datasource = {
    url?: string;
  };

  /**
   * Count Types
   */

  /**
   * Count Type SessionCountOutputType
   */

  export type SessionCountOutputType = {
    children: number;
    events: number;
  };

  export type SessionCountOutputTypeSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    children?: boolean | SessionCountOutputTypeCountChildrenArgs;
    events?: boolean | SessionCountOutputTypeCountEventsArgs;
  };

  // Custom InputTypes
  /**
   * SessionCountOutputType without action
   */
  export type SessionCountOutputTypeDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionCountOutputType
     */
    select?: SessionCountOutputTypeSelect<ExtArgs> | null;
  };

  /**
   * SessionCountOutputType without action
   */
  export type SessionCountOutputTypeCountChildrenArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: SessionWhereInput;
  };

  /**
   * SessionCountOutputType without action
   */
  export type SessionCountOutputTypeCountEventsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: SessionEventWhereInput;
  };

  /**
   * Models
   */

  /**
   * Model Session
   */

  export type AggregateSession = {
    _count: SessionCountAggregateOutputType | null;
    _avg: SessionAvgAggregateOutputType | null;
    _sum: SessionSumAggregateOutputType | null;
    _min: SessionMinAggregateOutputType | null;
    _max: SessionMaxAggregateOutputType | null;
  };

  export type SessionAvgAggregateOutputType = {
    maxTurns: number | null;
    maxBudgetUsd: number | null;
    prNumber: number | null;
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    numTurns: number | null;
    durationMs: number | null;
  };

  export type SessionSumAggregateOutputType = {
    maxTurns: number | null;
    maxBudgetUsd: number | null;
    prNumber: number | null;
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    numTurns: number | null;
    durationMs: number | null;
  };

  export type SessionMinAggregateOutputType = {
    id: string | null;
    status: $Enums.SessionStatus | null;
    taskDescription: string | null;
    userId: string | null;
    branchName: string | null;
    baseBranch: string | null;
    model: string | null;
    maxTurns: number | null;
    maxBudgetUsd: number | null;
    createPr: boolean | null;
    prUrl: string | null;
    prNumber: number | null;
    resultText: string | null;
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    numTurns: number | null;
    durationMs: number | null;
    failureCategory: string | null;
    sdkSessionId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    parentId: string | null;
  };

  export type SessionMaxAggregateOutputType = {
    id: string | null;
    status: $Enums.SessionStatus | null;
    taskDescription: string | null;
    userId: string | null;
    branchName: string | null;
    baseBranch: string | null;
    model: string | null;
    maxTurns: number | null;
    maxBudgetUsd: number | null;
    createPr: boolean | null;
    prUrl: string | null;
    prNumber: number | null;
    resultText: string | null;
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    numTurns: number | null;
    durationMs: number | null;
    failureCategory: string | null;
    sdkSessionId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    parentId: string | null;
  };

  export type SessionCountAggregateOutputType = {
    id: number;
    status: number;
    taskDescription: number;
    userId: number;
    branchName: number;
    baseBranch: number;
    model: number;
    maxTurns: number;
    maxBudgetUsd: number;
    createPr: number;
    prUrl: number;
    prNumber: number;
    resultText: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    numTurns: number;
    durationMs: number;
    errors: number;
    failureCategory: number;
    sdkSessionId: number;
    startedAt: number;
    completedAt: number;
    createdAt: number;
    updatedAt: number;
    parentId: number;
    _all: number;
  };

  export type SessionAvgAggregateInputType = {
    maxTurns?: true;
    maxBudgetUsd?: true;
    prNumber?: true;
    costUsd?: true;
    inputTokens?: true;
    outputTokens?: true;
    numTurns?: true;
    durationMs?: true;
  };

  export type SessionSumAggregateInputType = {
    maxTurns?: true;
    maxBudgetUsd?: true;
    prNumber?: true;
    costUsd?: true;
    inputTokens?: true;
    outputTokens?: true;
    numTurns?: true;
    durationMs?: true;
  };

  export type SessionMinAggregateInputType = {
    id?: true;
    status?: true;
    taskDescription?: true;
    userId?: true;
    branchName?: true;
    baseBranch?: true;
    model?: true;
    maxTurns?: true;
    maxBudgetUsd?: true;
    createPr?: true;
    prUrl?: true;
    prNumber?: true;
    resultText?: true;
    costUsd?: true;
    inputTokens?: true;
    outputTokens?: true;
    numTurns?: true;
    durationMs?: true;
    failureCategory?: true;
    sdkSessionId?: true;
    startedAt?: true;
    completedAt?: true;
    createdAt?: true;
    updatedAt?: true;
    parentId?: true;
  };

  export type SessionMaxAggregateInputType = {
    id?: true;
    status?: true;
    taskDescription?: true;
    userId?: true;
    branchName?: true;
    baseBranch?: true;
    model?: true;
    maxTurns?: true;
    maxBudgetUsd?: true;
    createPr?: true;
    prUrl?: true;
    prNumber?: true;
    resultText?: true;
    costUsd?: true;
    inputTokens?: true;
    outputTokens?: true;
    numTurns?: true;
    durationMs?: true;
    failureCategory?: true;
    sdkSessionId?: true;
    startedAt?: true;
    completedAt?: true;
    createdAt?: true;
    updatedAt?: true;
    parentId?: true;
  };

  export type SessionCountAggregateInputType = {
    id?: true;
    status?: true;
    taskDescription?: true;
    userId?: true;
    branchName?: true;
    baseBranch?: true;
    model?: true;
    maxTurns?: true;
    maxBudgetUsd?: true;
    createPr?: true;
    prUrl?: true;
    prNumber?: true;
    resultText?: true;
    costUsd?: true;
    inputTokens?: true;
    outputTokens?: true;
    numTurns?: true;
    durationMs?: true;
    errors?: true;
    failureCategory?: true;
    sdkSessionId?: true;
    startedAt?: true;
    completedAt?: true;
    createdAt?: true;
    updatedAt?: true;
    parentId?: true;
    _all?: true;
  };

  export type SessionAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Session to aggregate.
     */
    where?: SessionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: SessionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Sessions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned Sessions
     **/
    _count?: true | SessionCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
     **/
    _avg?: SessionAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
     **/
    _sum?: SessionSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: SessionMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: SessionMaxAggregateInputType;
  };

  export type GetSessionAggregateType<T extends SessionAggregateArgs> = {
    [P in keyof T & keyof AggregateSession]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSession[P]>
      : GetScalarType<T[P], AggregateSession[P]>;
  };

  export type SessionGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: SessionWhereInput;
    orderBy?: SessionOrderByWithAggregationInput | SessionOrderByWithAggregationInput[];
    by: SessionScalarFieldEnum[] | SessionScalarFieldEnum;
    having?: SessionScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SessionCountAggregateInputType | true;
    _avg?: SessionAvgAggregateInputType;
    _sum?: SessionSumAggregateInputType;
    _min?: SessionMinAggregateInputType;
    _max?: SessionMaxAggregateInputType;
  };

  export type SessionGroupByOutputType = {
    id: string;
    status: $Enums.SessionStatus;
    taskDescription: string;
    userId: string | null;
    branchName: string | null;
    baseBranch: string;
    model: string;
    maxTurns: number;
    maxBudgetUsd: number;
    createPr: boolean;
    prUrl: string | null;
    prNumber: number | null;
    resultText: string | null;
    costUsd: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    numTurns: number | null;
    durationMs: number | null;
    errors: JsonValue;
    failureCategory: string | null;
    sdkSessionId: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    parentId: string | null;
    _count: SessionCountAggregateOutputType | null;
    _avg: SessionAvgAggregateOutputType | null;
    _sum: SessionSumAggregateOutputType | null;
    _min: SessionMinAggregateOutputType | null;
    _max: SessionMaxAggregateOutputType | null;
  };

  type GetSessionGroupByPayload<T extends SessionGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SessionGroupByOutputType, T["by"]> & {
        [P in keyof T & keyof SessionGroupByOutputType]: P extends "_count"
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], SessionGroupByOutputType[P]>
          : GetScalarType<T[P], SessionGroupByOutputType[P]>;
      }
    >
  >;

  export type SessionSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        status?: boolean;
        taskDescription?: boolean;
        userId?: boolean;
        branchName?: boolean;
        baseBranch?: boolean;
        model?: boolean;
        maxTurns?: boolean;
        maxBudgetUsd?: boolean;
        createPr?: boolean;
        prUrl?: boolean;
        prNumber?: boolean;
        resultText?: boolean;
        costUsd?: boolean;
        inputTokens?: boolean;
        outputTokens?: boolean;
        numTurns?: boolean;
        durationMs?: boolean;
        errors?: boolean;
        failureCategory?: boolean;
        sdkSessionId?: boolean;
        startedAt?: boolean;
        completedAt?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
        parentId?: boolean;
        parent?: boolean | Session$parentArgs<ExtArgs>;
        children?: boolean | Session$childrenArgs<ExtArgs>;
        events?: boolean | Session$eventsArgs<ExtArgs>;
        _count?: boolean | SessionCountOutputTypeDefaultArgs<ExtArgs>;
      },
      ExtArgs["result"]["session"]
    >;

  export type SessionSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      status?: boolean;
      taskDescription?: boolean;
      userId?: boolean;
      branchName?: boolean;
      baseBranch?: boolean;
      model?: boolean;
      maxTurns?: boolean;
      maxBudgetUsd?: boolean;
      createPr?: boolean;
      prUrl?: boolean;
      prNumber?: boolean;
      resultText?: boolean;
      costUsd?: boolean;
      inputTokens?: boolean;
      outputTokens?: boolean;
      numTurns?: boolean;
      durationMs?: boolean;
      errors?: boolean;
      failureCategory?: boolean;
      sdkSessionId?: boolean;
      startedAt?: boolean;
      completedAt?: boolean;
      createdAt?: boolean;
      updatedAt?: boolean;
      parentId?: boolean;
      parent?: boolean | Session$parentArgs<ExtArgs>;
    },
    ExtArgs["result"]["session"]
  >;

  export type SessionSelectUpdateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      status?: boolean;
      taskDescription?: boolean;
      userId?: boolean;
      branchName?: boolean;
      baseBranch?: boolean;
      model?: boolean;
      maxTurns?: boolean;
      maxBudgetUsd?: boolean;
      createPr?: boolean;
      prUrl?: boolean;
      prNumber?: boolean;
      resultText?: boolean;
      costUsd?: boolean;
      inputTokens?: boolean;
      outputTokens?: boolean;
      numTurns?: boolean;
      durationMs?: boolean;
      errors?: boolean;
      failureCategory?: boolean;
      sdkSessionId?: boolean;
      startedAt?: boolean;
      completedAt?: boolean;
      createdAt?: boolean;
      updatedAt?: boolean;
      parentId?: boolean;
      parent?: boolean | Session$parentArgs<ExtArgs>;
    },
    ExtArgs["result"]["session"]
  >;

  export type SessionSelectScalar = {
    id?: boolean;
    status?: boolean;
    taskDescription?: boolean;
    userId?: boolean;
    branchName?: boolean;
    baseBranch?: boolean;
    model?: boolean;
    maxTurns?: boolean;
    maxBudgetUsd?: boolean;
    createPr?: boolean;
    prUrl?: boolean;
    prNumber?: boolean;
    resultText?: boolean;
    costUsd?: boolean;
    inputTokens?: boolean;
    outputTokens?: boolean;
    numTurns?: boolean;
    durationMs?: boolean;
    errors?: boolean;
    failureCategory?: boolean;
    sdkSessionId?: boolean;
    startedAt?: boolean;
    completedAt?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    parentId?: boolean;
  };

  export type SessionOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetOmit<
      | "id"
      | "status"
      | "taskDescription"
      | "userId"
      | "branchName"
      | "baseBranch"
      | "model"
      | "maxTurns"
      | "maxBudgetUsd"
      | "createPr"
      | "prUrl"
      | "prNumber"
      | "resultText"
      | "costUsd"
      | "inputTokens"
      | "outputTokens"
      | "numTurns"
      | "durationMs"
      | "errors"
      | "failureCategory"
      | "sdkSessionId"
      | "startedAt"
      | "completedAt"
      | "createdAt"
      | "updatedAt"
      | "parentId",
      ExtArgs["result"]["session"]
    >;
  export type SessionInclude<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    parent?: boolean | Session$parentArgs<ExtArgs>;
    children?: boolean | Session$childrenArgs<ExtArgs>;
    events?: boolean | Session$eventsArgs<ExtArgs>;
    _count?: boolean | SessionCountOutputTypeDefaultArgs<ExtArgs>;
  };
  export type SessionIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    parent?: boolean | Session$parentArgs<ExtArgs>;
  };
  export type SessionIncludeUpdateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    parent?: boolean | Session$parentArgs<ExtArgs>;
  };

  export type $SessionPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    {
      name: "Session";
      objects: {
        parent: Prisma.$SessionPayload<ExtArgs> | null;
        children: Prisma.$SessionPayload<ExtArgs>[];
        events: Prisma.$SessionEventPayload<ExtArgs>[];
      };
      scalars: $Extensions.GetPayloadResult<
        {
          id: string;
          status: $Enums.SessionStatus;
          taskDescription: string;
          userId: string | null;
          branchName: string | null;
          baseBranch: string;
          model: string;
          maxTurns: number;
          maxBudgetUsd: number;
          createPr: boolean;
          prUrl: string | null;
          prNumber: number | null;
          resultText: string | null;
          costUsd: number | null;
          inputTokens: number | null;
          outputTokens: number | null;
          numTurns: number | null;
          durationMs: number | null;
          errors: Prisma.JsonValue;
          failureCategory: string | null;
          sdkSessionId: string | null;
          startedAt: Date | null;
          completedAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
          parentId: string | null;
        },
        ExtArgs["result"]["session"]
      >;
      composites: {};
    };

  type SessionGetPayload<S extends boolean | null | undefined | SessionDefaultArgs> =
    $Result.GetResult<Prisma.$SessionPayload, S>;

  type SessionCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = Omit<
    SessionFindManyArgs,
    "select" | "include" | "distinct" | "omit"
  > & {
    select?: SessionCountAggregateInputType | true;
  };

  export interface SessionDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>["model"]["Session"]; meta: { name: "Session" } };
    /**
     * Find zero or one Session that matches the filter.
     * @param {SessionFindUniqueArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SessionFindUniqueArgs>(
      args: SelectSubset<T, SessionFindUniqueArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find one Session that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SessionFindUniqueOrThrowArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SessionFindUniqueOrThrowArgs>(
      args: SelectSubset<T, SessionFindUniqueOrThrowArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first Session that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionFindFirstArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SessionFindFirstArgs>(
      args?: SelectSubset<T, SessionFindFirstArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first Session that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionFindFirstOrThrowArgs} args - Arguments to find a Session
     * @example
     * // Get one Session
     * const session = await prisma.session.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SessionFindFirstOrThrowArgs>(
      args?: SelectSubset<T, SessionFindFirstOrThrowArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find zero or more Sessions that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all Sessions
     * const sessions = await prisma.session.findMany()
     *
     * // Get first 10 Sessions
     * const sessions = await prisma.session.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const sessionWithIdOnly = await prisma.session.findMany({ select: { id: true } })
     *
     */
    findMany<T extends SessionFindManyArgs>(
      args?: SelectSubset<T, SessionFindManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>
    >;

    /**
     * Create a Session.
     * @param {SessionCreateArgs} args - Arguments to create a Session.
     * @example
     * // Create one Session
     * const Session = await prisma.session.create({
     *   data: {
     *     // ... data to create a Session
     *   }
     * })
     *
     */
    create<T extends SessionCreateArgs>(
      args: SelectSubset<T, SessionCreateArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "create", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Create many Sessions.
     * @param {SessionCreateManyArgs} args - Arguments to create many Sessions.
     * @example
     * // Create many Sessions
     * const session = await prisma.session.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends SessionCreateManyArgs>(
      args?: SelectSubset<T, SessionCreateManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many Sessions and returns the data saved in the database.
     * @param {SessionCreateManyAndReturnArgs} args - Arguments to create many Sessions.
     * @example
     * // Create many Sessions
     * const session = await prisma.session.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many Sessions and only return the `id`
     * const sessionWithIdOnly = await prisma.session.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends SessionCreateManyAndReturnArgs>(
      args?: SelectSubset<T, SessionCreateManyAndReturnArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$SessionPayload<ExtArgs>,
        T,
        "createManyAndReturn",
        GlobalOmitOptions
      >
    >;

    /**
     * Delete a Session.
     * @param {SessionDeleteArgs} args - Arguments to delete one Session.
     * @example
     * // Delete one Session
     * const Session = await prisma.session.delete({
     *   where: {
     *     // ... filter to delete one Session
     *   }
     * })
     *
     */
    delete<T extends SessionDeleteArgs>(
      args: SelectSubset<T, SessionDeleteArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "delete", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Update one Session.
     * @param {SessionUpdateArgs} args - Arguments to update one Session.
     * @example
     * // Update one Session
     * const session = await prisma.session.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends SessionUpdateArgs>(
      args: SelectSubset<T, SessionUpdateArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "update", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Delete zero or more Sessions.
     * @param {SessionDeleteManyArgs} args - Arguments to filter Sessions to delete.
     * @example
     * // Delete a few Sessions
     * const { count } = await prisma.session.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends SessionDeleteManyArgs>(
      args?: SelectSubset<T, SessionDeleteManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Sessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many Sessions
     * const session = await prisma.session.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends SessionUpdateManyArgs>(
      args: SelectSubset<T, SessionUpdateManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more Sessions and returns the data updated in the database.
     * @param {SessionUpdateManyAndReturnArgs} args - Arguments to update many Sessions.
     * @example
     * // Update many Sessions
     * const session = await prisma.session.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more Sessions and only return the `id`
     * const sessionWithIdOnly = await prisma.session.updateManyAndReturn({
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
    updateManyAndReturn<T extends SessionUpdateManyAndReturnArgs>(
      args: SelectSubset<T, SessionUpdateManyAndReturnArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$SessionPayload<ExtArgs>,
        T,
        "updateManyAndReturn",
        GlobalOmitOptions
      >
    >;

    /**
     * Create or update one Session.
     * @param {SessionUpsertArgs} args - Arguments to update or create a Session.
     * @example
     * // Update or create a Session
     * const session = await prisma.session.upsert({
     *   create: {
     *     // ... data to create a Session
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the Session we want to update
     *   }
     * })
     */
    upsert<T extends SessionUpsertArgs>(
      args: SelectSubset<T, SessionUpsertArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Count the number of Sessions.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionCountArgs} args - Arguments to filter Sessions to count.
     * @example
     * // Count the number of Sessions
     * const count = await prisma.session.count({
     *   where: {
     *     // ... the filter for the Sessions we want to count
     *   }
     * })
     **/
    count<T extends SessionCountArgs>(
      args?: Subset<T, SessionCountArgs>
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], SessionCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a Session.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SessionAggregateArgs>(
      args: Subset<T, SessionAggregateArgs>
    ): Prisma.PrismaPromise<GetSessionAggregateType<T>>;

    /**
     * Group by Session.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionGroupByArgs} args - Group by arguments.
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
      T extends SessionGroupByArgs,
      HasSelectOrTake extends Or<Extends<"skip", Keys<T>>, Extends<"take", Keys<T>>>,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SessionGroupByArgs["orderBy"] }
        : { orderBy?: SessionGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T["orderBy"]>>>,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [Error, "Field ", P, ` in "having" needs to be provided in "by"`];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, SessionGroupByArgs, OrderByArg> & InputErrors
    ): {} extends InputErrors ? GetSessionGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the Session model
     */
    readonly fields: SessionFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for Session.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SessionClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    parent<T extends Session$parentArgs<ExtArgs> = {}>(
      args?: Subset<T, Session$parentArgs<ExtArgs>>
    ): Prisma__SessionClient<
      $Result.GetResult<
        Prisma.$SessionPayload<ExtArgs>,
        T,
        "findUniqueOrThrow",
        GlobalOmitOptions
      > | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;
    children<T extends Session$childrenArgs<ExtArgs> = {}>(
      args?: Subset<T, Session$childrenArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$SessionPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null
    >;
    events<T extends Session$eventsArgs<ExtArgs> = {}>(
      args?: Subset<T, Session$eventsArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      | $Result.GetResult<Prisma.$SessionEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>
      | Null
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the Session model
   */
  interface SessionFieldRefs {
    readonly id: FieldRef<"Session", "String">;
    readonly status: FieldRef<"Session", "SessionStatus">;
    readonly taskDescription: FieldRef<"Session", "String">;
    readonly userId: FieldRef<"Session", "String">;
    readonly branchName: FieldRef<"Session", "String">;
    readonly baseBranch: FieldRef<"Session", "String">;
    readonly model: FieldRef<"Session", "String">;
    readonly maxTurns: FieldRef<"Session", "Int">;
    readonly maxBudgetUsd: FieldRef<"Session", "Float">;
    readonly createPr: FieldRef<"Session", "Boolean">;
    readonly prUrl: FieldRef<"Session", "String">;
    readonly prNumber: FieldRef<"Session", "Int">;
    readonly resultText: FieldRef<"Session", "String">;
    readonly costUsd: FieldRef<"Session", "Float">;
    readonly inputTokens: FieldRef<"Session", "Int">;
    readonly outputTokens: FieldRef<"Session", "Int">;
    readonly numTurns: FieldRef<"Session", "Int">;
    readonly durationMs: FieldRef<"Session", "Int">;
    readonly errors: FieldRef<"Session", "Json">;
    readonly failureCategory: FieldRef<"Session", "String">;
    readonly sdkSessionId: FieldRef<"Session", "String">;
    readonly startedAt: FieldRef<"Session", "DateTime">;
    readonly completedAt: FieldRef<"Session", "DateTime">;
    readonly createdAt: FieldRef<"Session", "DateTime">;
    readonly updatedAt: FieldRef<"Session", "DateTime">;
    readonly parentId: FieldRef<"Session", "String">;
  }

  // Custom InputTypes
  /**
   * Session findUnique
   */
  export type SessionFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * Filter, which Session to fetch.
     */
    where: SessionWhereUniqueInput;
  };

  /**
   * Session findUniqueOrThrow
   */
  export type SessionFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * Filter, which Session to fetch.
     */
    where: SessionWhereUniqueInput;
  };

  /**
   * Session findFirst
   */
  export type SessionFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * Filter, which Session to fetch.
     */
    where?: SessionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Sessions.
     */
    cursor?: SessionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Sessions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Sessions.
     */
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[];
  };

  /**
   * Session findFirstOrThrow
   */
  export type SessionFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * Filter, which Session to fetch.
     */
    where?: SessionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for Sessions.
     */
    cursor?: SessionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Sessions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Sessions.
     */
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[];
  };

  /**
   * Session findMany
   */
  export type SessionFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * Filter, which Sessions to fetch.
     */
    where?: SessionWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of Sessions to fetch.
     */
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing Sessions.
     */
    cursor?: SessionWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` Sessions from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` Sessions.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of Sessions.
     */
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[];
  };

  /**
   * Session create
   */
  export type SessionCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * The data needed to create a Session.
     */
    data: XOR<SessionCreateInput, SessionUncheckedCreateInput>;
  };

  /**
   * Session createMany
   */
  export type SessionCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many Sessions.
     */
    data: SessionCreateManyInput | SessionCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * Session createManyAndReturn
   */
  export type SessionCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * The data used to create many Sessions.
     */
    data: SessionCreateManyInput | SessionCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionIncludeCreateManyAndReturn<ExtArgs> | null;
  };

  /**
   * Session update
   */
  export type SessionUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * The data needed to update a Session.
     */
    data: XOR<SessionUpdateInput, SessionUncheckedUpdateInput>;
    /**
     * Choose, which Session to update.
     */
    where: SessionWhereUniqueInput;
  };

  /**
   * Session updateMany
   */
  export type SessionUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update Sessions.
     */
    data: XOR<SessionUpdateManyMutationInput, SessionUncheckedUpdateManyInput>;
    /**
     * Filter which Sessions to update
     */
    where?: SessionWhereInput;
    /**
     * Limit how many Sessions to update.
     */
    limit?: number;
  };

  /**
   * Session updateManyAndReturn
   */
  export type SessionUpdateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * The data used to update Sessions.
     */
    data: XOR<SessionUpdateManyMutationInput, SessionUncheckedUpdateManyInput>;
    /**
     * Filter which Sessions to update
     */
    where?: SessionWhereInput;
    /**
     * Limit how many Sessions to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionIncludeUpdateManyAndReturn<ExtArgs> | null;
  };

  /**
   * Session upsert
   */
  export type SessionUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * The filter to search for the Session to update in case it exists.
     */
    where: SessionWhereUniqueInput;
    /**
     * In case the Session found by the `where` argument doesn't exist, create a new Session with this data.
     */
    create: XOR<SessionCreateInput, SessionUncheckedCreateInput>;
    /**
     * In case the Session was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SessionUpdateInput, SessionUncheckedUpdateInput>;
  };

  /**
   * Session delete
   */
  export type SessionDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    /**
     * Filter which Session to delete.
     */
    where: SessionWhereUniqueInput;
  };

  /**
   * Session deleteMany
   */
  export type SessionDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which Sessions to delete
     */
    where?: SessionWhereInput;
    /**
     * Limit how many Sessions to delete.
     */
    limit?: number;
  };

  /**
   * Session.parent
   */
  export type Session$parentArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    where?: SessionWhereInput;
  };

  /**
   * Session.children
   */
  export type Session$childrenArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
    where?: SessionWhereInput;
    orderBy?: SessionOrderByWithRelationInput | SessionOrderByWithRelationInput[];
    cursor?: SessionWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: SessionScalarFieldEnum | SessionScalarFieldEnum[];
  };

  /**
   * Session.events
   */
  export type Session$eventsArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    where?: SessionEventWhereInput;
    orderBy?: SessionEventOrderByWithRelationInput | SessionEventOrderByWithRelationInput[];
    cursor?: SessionEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: SessionEventScalarFieldEnum | SessionEventScalarFieldEnum[];
  };

  /**
   * Session without action
   */
  export type SessionDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the Session
     */
    select?: SessionSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the Session
     */
    omit?: SessionOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionInclude<ExtArgs> | null;
  };

  /**
   * Model SessionEvent
   */

  export type AggregateSessionEvent = {
    _count: SessionEventCountAggregateOutputType | null;
    _avg: SessionEventAvgAggregateOutputType | null;
    _sum: SessionEventSumAggregateOutputType | null;
    _min: SessionEventMinAggregateOutputType | null;
    _max: SessionEventMaxAggregateOutputType | null;
  };

  export type SessionEventAvgAggregateOutputType = {
    turnIndex: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    costUsd: number | null;
    toolLatencyMs: number | null;
  };

  export type SessionEventSumAggregateOutputType = {
    turnIndex: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    costUsd: number | null;
    toolLatencyMs: number | null;
  };

  export type SessionEventMinAggregateOutputType = {
    id: string | null;
    sessionId: string | null;
    type: string | null;
    createdAt: Date | null;
    turnIndex: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    costUsd: number | null;
    modelId: string | null;
    toolName: string | null;
    toolUseId: string | null;
    toolLatencyMs: number | null;
    toolIsError: boolean | null;
  };

  export type SessionEventMaxAggregateOutputType = {
    id: string | null;
    sessionId: string | null;
    type: string | null;
    createdAt: Date | null;
    turnIndex: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    costUsd: number | null;
    modelId: string | null;
    toolName: string | null;
    toolUseId: string | null;
    toolLatencyMs: number | null;
    toolIsError: boolean | null;
  };

  export type SessionEventCountAggregateOutputType = {
    id: number;
    sessionId: number;
    type: number;
    data: number;
    createdAt: number;
    turnIndex: number;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    costUsd: number;
    modelId: number;
    toolName: number;
    toolUseId: number;
    toolLatencyMs: number;
    toolIsError: number;
    _all: number;
  };

  export type SessionEventAvgAggregateInputType = {
    turnIndex?: true;
    inputTokens?: true;
    outputTokens?: true;
    thinkingTokens?: true;
    costUsd?: true;
    toolLatencyMs?: true;
  };

  export type SessionEventSumAggregateInputType = {
    turnIndex?: true;
    inputTokens?: true;
    outputTokens?: true;
    thinkingTokens?: true;
    costUsd?: true;
    toolLatencyMs?: true;
  };

  export type SessionEventMinAggregateInputType = {
    id?: true;
    sessionId?: true;
    type?: true;
    createdAt?: true;
    turnIndex?: true;
    inputTokens?: true;
    outputTokens?: true;
    thinkingTokens?: true;
    costUsd?: true;
    modelId?: true;
    toolName?: true;
    toolUseId?: true;
    toolLatencyMs?: true;
    toolIsError?: true;
  };

  export type SessionEventMaxAggregateInputType = {
    id?: true;
    sessionId?: true;
    type?: true;
    createdAt?: true;
    turnIndex?: true;
    inputTokens?: true;
    outputTokens?: true;
    thinkingTokens?: true;
    costUsd?: true;
    modelId?: true;
    toolName?: true;
    toolUseId?: true;
    toolLatencyMs?: true;
    toolIsError?: true;
  };

  export type SessionEventCountAggregateInputType = {
    id?: true;
    sessionId?: true;
    type?: true;
    data?: true;
    createdAt?: true;
    turnIndex?: true;
    inputTokens?: true;
    outputTokens?: true;
    thinkingTokens?: true;
    costUsd?: true;
    modelId?: true;
    toolName?: true;
    toolUseId?: true;
    toolLatencyMs?: true;
    toolIsError?: true;
    _all?: true;
  };

  export type SessionEventAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which SessionEvent to aggregate.
     */
    where?: SessionEventWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SessionEvents to fetch.
     */
    orderBy?: SessionEventOrderByWithRelationInput | SessionEventOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: SessionEventWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SessionEvents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SessionEvents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned SessionEvents
     **/
    _count?: true | SessionEventCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to average
     **/
    _avg?: SessionEventAvgAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to sum
     **/
    _sum?: SessionEventSumAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: SessionEventMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: SessionEventMaxAggregateInputType;
  };

  export type GetSessionEventAggregateType<T extends SessionEventAggregateArgs> = {
    [P in keyof T & keyof AggregateSessionEvent]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateSessionEvent[P]>
      : GetScalarType<T[P], AggregateSessionEvent[P]>;
  };

  export type SessionEventGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: SessionEventWhereInput;
    orderBy?: SessionEventOrderByWithAggregationInput | SessionEventOrderByWithAggregationInput[];
    by: SessionEventScalarFieldEnum[] | SessionEventScalarFieldEnum;
    having?: SessionEventScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: SessionEventCountAggregateInputType | true;
    _avg?: SessionEventAvgAggregateInputType;
    _sum?: SessionEventSumAggregateInputType;
    _min?: SessionEventMinAggregateInputType;
    _max?: SessionEventMaxAggregateInputType;
  };

  export type SessionEventGroupByOutputType = {
    id: string;
    sessionId: string;
    type: string;
    data: JsonValue;
    createdAt: Date;
    turnIndex: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    costUsd: number | null;
    modelId: string | null;
    toolName: string | null;
    toolUseId: string | null;
    toolLatencyMs: number | null;
    toolIsError: boolean | null;
    _count: SessionEventCountAggregateOutputType | null;
    _avg: SessionEventAvgAggregateOutputType | null;
    _sum: SessionEventSumAggregateOutputType | null;
    _min: SessionEventMinAggregateOutputType | null;
    _max: SessionEventMaxAggregateOutputType | null;
  };

  type GetSessionEventGroupByPayload<T extends SessionEventGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<SessionEventGroupByOutputType, T["by"]> & {
        [P in keyof T & keyof SessionEventGroupByOutputType]: P extends "_count"
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], SessionEventGroupByOutputType[P]>
          : GetScalarType<T[P], SessionEventGroupByOutputType[P]>;
      }
    >
  >;

  export type SessionEventSelect<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      sessionId?: boolean;
      type?: boolean;
      data?: boolean;
      createdAt?: boolean;
      turnIndex?: boolean;
      inputTokens?: boolean;
      outputTokens?: boolean;
      thinkingTokens?: boolean;
      costUsd?: boolean;
      modelId?: boolean;
      toolName?: boolean;
      toolUseId?: boolean;
      toolLatencyMs?: boolean;
      toolIsError?: boolean;
      session?: boolean | SessionDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["sessionEvent"]
  >;

  export type SessionEventSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      sessionId?: boolean;
      type?: boolean;
      data?: boolean;
      createdAt?: boolean;
      turnIndex?: boolean;
      inputTokens?: boolean;
      outputTokens?: boolean;
      thinkingTokens?: boolean;
      costUsd?: boolean;
      modelId?: boolean;
      toolName?: boolean;
      toolUseId?: boolean;
      toolLatencyMs?: boolean;
      toolIsError?: boolean;
      session?: boolean | SessionDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["sessionEvent"]
  >;

  export type SessionEventSelectUpdateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      sessionId?: boolean;
      type?: boolean;
      data?: boolean;
      createdAt?: boolean;
      turnIndex?: boolean;
      inputTokens?: boolean;
      outputTokens?: boolean;
      thinkingTokens?: boolean;
      costUsd?: boolean;
      modelId?: boolean;
      toolName?: boolean;
      toolUseId?: boolean;
      toolLatencyMs?: boolean;
      toolIsError?: boolean;
      session?: boolean | SessionDefaultArgs<ExtArgs>;
    },
    ExtArgs["result"]["sessionEvent"]
  >;

  export type SessionEventSelectScalar = {
    id?: boolean;
    sessionId?: boolean;
    type?: boolean;
    data?: boolean;
    createdAt?: boolean;
    turnIndex?: boolean;
    inputTokens?: boolean;
    outputTokens?: boolean;
    thinkingTokens?: boolean;
    costUsd?: boolean;
    modelId?: boolean;
    toolName?: boolean;
    toolUseId?: boolean;
    toolLatencyMs?: boolean;
    toolIsError?: boolean;
  };

  export type SessionEventOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetOmit<
      | "id"
      | "sessionId"
      | "type"
      | "data"
      | "createdAt"
      | "turnIndex"
      | "inputTokens"
      | "outputTokens"
      | "thinkingTokens"
      | "costUsd"
      | "modelId"
      | "toolName"
      | "toolUseId"
      | "toolLatencyMs"
      | "toolIsError",
      ExtArgs["result"]["sessionEvent"]
    >;
  export type SessionEventInclude<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    session?: boolean | SessionDefaultArgs<ExtArgs>;
  };
  export type SessionEventIncludeCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    session?: boolean | SessionDefaultArgs<ExtArgs>;
  };
  export type SessionEventIncludeUpdateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    session?: boolean | SessionDefaultArgs<ExtArgs>;
  };

  export type $SessionEventPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "SessionEvent";
    objects: {
      session: Prisma.$SessionPayload<ExtArgs>;
    };
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        sessionId: string;
        type: string;
        data: Prisma.JsonValue;
        createdAt: Date;
        turnIndex: number | null;
        inputTokens: number | null;
        outputTokens: number | null;
        thinkingTokens: number | null;
        costUsd: number | null;
        modelId: string | null;
        toolName: string | null;
        toolUseId: string | null;
        toolLatencyMs: number | null;
        toolIsError: boolean | null;
      },
      ExtArgs["result"]["sessionEvent"]
    >;
    composites: {};
  };

  type SessionEventGetPayload<S extends boolean | null | undefined | SessionEventDefaultArgs> =
    $Result.GetResult<Prisma.$SessionEventPayload, S>;

  type SessionEventCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<SessionEventFindManyArgs, "select" | "include" | "distinct" | "omit"> & {
      select?: SessionEventCountAggregateInputType | true;
    };

  export interface SessionEventDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["SessionEvent"];
      meta: { name: "SessionEvent" };
    };
    /**
     * Find zero or one SessionEvent that matches the filter.
     * @param {SessionEventFindUniqueArgs} args - Arguments to find a SessionEvent
     * @example
     * // Get one SessionEvent
     * const sessionEvent = await prisma.sessionEvent.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends SessionEventFindUniqueArgs>(
      args: SelectSubset<T, SessionEventFindUniqueArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<
        Prisma.$SessionEventPayload<ExtArgs>,
        T,
        "findUnique",
        GlobalOmitOptions
      > | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find one SessionEvent that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {SessionEventFindUniqueOrThrowArgs} args - Arguments to find a SessionEvent
     * @example
     * // Get one SessionEvent
     * const sessionEvent = await prisma.sessionEvent.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends SessionEventFindUniqueOrThrowArgs>(
      args: SelectSubset<T, SessionEventFindUniqueOrThrowArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<
        Prisma.$SessionEventPayload<ExtArgs>,
        T,
        "findUniqueOrThrow",
        GlobalOmitOptions
      >,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first SessionEvent that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventFindFirstArgs} args - Arguments to find a SessionEvent
     * @example
     * // Get one SessionEvent
     * const sessionEvent = await prisma.sessionEvent.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends SessionEventFindFirstArgs>(
      args?: SelectSubset<T, SessionEventFindFirstArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<
        Prisma.$SessionEventPayload<ExtArgs>,
        T,
        "findFirst",
        GlobalOmitOptions
      > | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first SessionEvent that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventFindFirstOrThrowArgs} args - Arguments to find a SessionEvent
     * @example
     * // Get one SessionEvent
     * const sessionEvent = await prisma.sessionEvent.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends SessionEventFindFirstOrThrowArgs>(
      args?: SelectSubset<T, SessionEventFindFirstOrThrowArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<
        Prisma.$SessionEventPayload<ExtArgs>,
        T,
        "findFirstOrThrow",
        GlobalOmitOptions
      >,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find zero or more SessionEvents that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all SessionEvents
     * const sessionEvents = await prisma.sessionEvent.findMany()
     *
     * // Get first 10 SessionEvents
     * const sessionEvents = await prisma.sessionEvent.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const sessionEventWithIdOnly = await prisma.sessionEvent.findMany({ select: { id: true } })
     *
     */
    findMany<T extends SessionEventFindManyArgs>(
      args?: SelectSubset<T, SessionEventFindManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$SessionEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>
    >;

    /**
     * Create a SessionEvent.
     * @param {SessionEventCreateArgs} args - Arguments to create a SessionEvent.
     * @example
     * // Create one SessionEvent
     * const SessionEvent = await prisma.sessionEvent.create({
     *   data: {
     *     // ... data to create a SessionEvent
     *   }
     * })
     *
     */
    create<T extends SessionEventCreateArgs>(
      args: SelectSubset<T, SessionEventCreateArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<Prisma.$SessionEventPayload<ExtArgs>, T, "create", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Create many SessionEvents.
     * @param {SessionEventCreateManyArgs} args - Arguments to create many SessionEvents.
     * @example
     * // Create many SessionEvents
     * const sessionEvent = await prisma.sessionEvent.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends SessionEventCreateManyArgs>(
      args?: SelectSubset<T, SessionEventCreateManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many SessionEvents and returns the data saved in the database.
     * @param {SessionEventCreateManyAndReturnArgs} args - Arguments to create many SessionEvents.
     * @example
     * // Create many SessionEvents
     * const sessionEvent = await prisma.sessionEvent.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many SessionEvents and only return the `id`
     * const sessionEventWithIdOnly = await prisma.sessionEvent.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends SessionEventCreateManyAndReturnArgs>(
      args?: SelectSubset<T, SessionEventCreateManyAndReturnArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$SessionEventPayload<ExtArgs>,
        T,
        "createManyAndReturn",
        GlobalOmitOptions
      >
    >;

    /**
     * Delete a SessionEvent.
     * @param {SessionEventDeleteArgs} args - Arguments to delete one SessionEvent.
     * @example
     * // Delete one SessionEvent
     * const SessionEvent = await prisma.sessionEvent.delete({
     *   where: {
     *     // ... filter to delete one SessionEvent
     *   }
     * })
     *
     */
    delete<T extends SessionEventDeleteArgs>(
      args: SelectSubset<T, SessionEventDeleteArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<Prisma.$SessionEventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Update one SessionEvent.
     * @param {SessionEventUpdateArgs} args - Arguments to update one SessionEvent.
     * @example
     * // Update one SessionEvent
     * const sessionEvent = await prisma.sessionEvent.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends SessionEventUpdateArgs>(
      args: SelectSubset<T, SessionEventUpdateArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<Prisma.$SessionEventPayload<ExtArgs>, T, "update", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Delete zero or more SessionEvents.
     * @param {SessionEventDeleteManyArgs} args - Arguments to filter SessionEvents to delete.
     * @example
     * // Delete a few SessionEvents
     * const { count } = await prisma.sessionEvent.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends SessionEventDeleteManyArgs>(
      args?: SelectSubset<T, SessionEventDeleteManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more SessionEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many SessionEvents
     * const sessionEvent = await prisma.sessionEvent.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends SessionEventUpdateManyArgs>(
      args: SelectSubset<T, SessionEventUpdateManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more SessionEvents and returns the data updated in the database.
     * @param {SessionEventUpdateManyAndReturnArgs} args - Arguments to update many SessionEvents.
     * @example
     * // Update many SessionEvents
     * const sessionEvent = await prisma.sessionEvent.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more SessionEvents and only return the `id`
     * const sessionEventWithIdOnly = await prisma.sessionEvent.updateManyAndReturn({
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
    updateManyAndReturn<T extends SessionEventUpdateManyAndReturnArgs>(
      args: SelectSubset<T, SessionEventUpdateManyAndReturnArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$SessionEventPayload<ExtArgs>,
        T,
        "updateManyAndReturn",
        GlobalOmitOptions
      >
    >;

    /**
     * Create or update one SessionEvent.
     * @param {SessionEventUpsertArgs} args - Arguments to update or create a SessionEvent.
     * @example
     * // Update or create a SessionEvent
     * const sessionEvent = await prisma.sessionEvent.upsert({
     *   create: {
     *     // ... data to create a SessionEvent
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the SessionEvent we want to update
     *   }
     * })
     */
    upsert<T extends SessionEventUpsertArgs>(
      args: SelectSubset<T, SessionEventUpsertArgs<ExtArgs>>
    ): Prisma__SessionEventClient<
      $Result.GetResult<Prisma.$SessionEventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Count the number of SessionEvents.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventCountArgs} args - Arguments to filter SessionEvents to count.
     * @example
     * // Count the number of SessionEvents
     * const count = await prisma.sessionEvent.count({
     *   where: {
     *     // ... the filter for the SessionEvents we want to count
     *   }
     * })
     **/
    count<T extends SessionEventCountArgs>(
      args?: Subset<T, SessionEventCountArgs>
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], SessionEventCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a SessionEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends SessionEventAggregateArgs>(
      args: Subset<T, SessionEventAggregateArgs>
    ): Prisma.PrismaPromise<GetSessionEventAggregateType<T>>;

    /**
     * Group by SessionEvent.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {SessionEventGroupByArgs} args - Group by arguments.
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
      T extends SessionEventGroupByArgs,
      HasSelectOrTake extends Or<Extends<"skip", Keys<T>>, Extends<"take", Keys<T>>>,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: SessionEventGroupByArgs["orderBy"] }
        : { orderBy?: SessionEventGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T["orderBy"]>>>,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [Error, "Field ", P, ` in "having" needs to be provided in "by"`];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, SessionEventGroupByArgs, OrderByArg> & InputErrors
    ): {} extends InputErrors
      ? GetSessionEventGroupByPayload<T>
      : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the SessionEvent model
     */
    readonly fields: SessionEventFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for SessionEvent.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__SessionEventClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    session<T extends SessionDefaultArgs<ExtArgs> = {}>(
      args?: Subset<T, SessionDefaultArgs<ExtArgs>>
    ): Prisma__SessionClient<
      | $Result.GetResult<
          Prisma.$SessionPayload<ExtArgs>,
          T,
          "findUniqueOrThrow",
          GlobalOmitOptions
        >
      | Null,
      Null,
      ExtArgs,
      GlobalOmitOptions
    >;
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the SessionEvent model
   */
  interface SessionEventFieldRefs {
    readonly id: FieldRef<"SessionEvent", "String">;
    readonly sessionId: FieldRef<"SessionEvent", "String">;
    readonly type: FieldRef<"SessionEvent", "String">;
    readonly data: FieldRef<"SessionEvent", "Json">;
    readonly createdAt: FieldRef<"SessionEvent", "DateTime">;
    readonly turnIndex: FieldRef<"SessionEvent", "Int">;
    readonly inputTokens: FieldRef<"SessionEvent", "Int">;
    readonly outputTokens: FieldRef<"SessionEvent", "Int">;
    readonly thinkingTokens: FieldRef<"SessionEvent", "Int">;
    readonly costUsd: FieldRef<"SessionEvent", "Float">;
    readonly modelId: FieldRef<"SessionEvent", "String">;
    readonly toolName: FieldRef<"SessionEvent", "String">;
    readonly toolUseId: FieldRef<"SessionEvent", "String">;
    readonly toolLatencyMs: FieldRef<"SessionEvent", "Int">;
    readonly toolIsError: FieldRef<"SessionEvent", "Boolean">;
  }

  // Custom InputTypes
  /**
   * SessionEvent findUnique
   */
  export type SessionEventFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * Filter, which SessionEvent to fetch.
     */
    where: SessionEventWhereUniqueInput;
  };

  /**
   * SessionEvent findUniqueOrThrow
   */
  export type SessionEventFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * Filter, which SessionEvent to fetch.
     */
    where: SessionEventWhereUniqueInput;
  };

  /**
   * SessionEvent findFirst
   */
  export type SessionEventFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * Filter, which SessionEvent to fetch.
     */
    where?: SessionEventWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SessionEvents to fetch.
     */
    orderBy?: SessionEventOrderByWithRelationInput | SessionEventOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SessionEvents.
     */
    cursor?: SessionEventWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SessionEvents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SessionEvents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SessionEvents.
     */
    distinct?: SessionEventScalarFieldEnum | SessionEventScalarFieldEnum[];
  };

  /**
   * SessionEvent findFirstOrThrow
   */
  export type SessionEventFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * Filter, which SessionEvent to fetch.
     */
    where?: SessionEventWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SessionEvents to fetch.
     */
    orderBy?: SessionEventOrderByWithRelationInput | SessionEventOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for SessionEvents.
     */
    cursor?: SessionEventWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SessionEvents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SessionEvents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SessionEvents.
     */
    distinct?: SessionEventScalarFieldEnum | SessionEventScalarFieldEnum[];
  };

  /**
   * SessionEvent findMany
   */
  export type SessionEventFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * Filter, which SessionEvents to fetch.
     */
    where?: SessionEventWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of SessionEvents to fetch.
     */
    orderBy?: SessionEventOrderByWithRelationInput | SessionEventOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing SessionEvents.
     */
    cursor?: SessionEventWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` SessionEvents from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` SessionEvents.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of SessionEvents.
     */
    distinct?: SessionEventScalarFieldEnum | SessionEventScalarFieldEnum[];
  };

  /**
   * SessionEvent create
   */
  export type SessionEventCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * The data needed to create a SessionEvent.
     */
    data: XOR<SessionEventCreateInput, SessionEventUncheckedCreateInput>;
  };

  /**
   * SessionEvent createMany
   */
  export type SessionEventCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many SessionEvents.
     */
    data: SessionEventCreateManyInput | SessionEventCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * SessionEvent createManyAndReturn
   */
  export type SessionEventCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * The data used to create many SessionEvents.
     */
    data: SessionEventCreateManyInput | SessionEventCreateManyInput[];
    skipDuplicates?: boolean;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventIncludeCreateManyAndReturn<ExtArgs> | null;
  };

  /**
   * SessionEvent update
   */
  export type SessionEventUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * The data needed to update a SessionEvent.
     */
    data: XOR<SessionEventUpdateInput, SessionEventUncheckedUpdateInput>;
    /**
     * Choose, which SessionEvent to update.
     */
    where: SessionEventWhereUniqueInput;
  };

  /**
   * SessionEvent updateMany
   */
  export type SessionEventUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update SessionEvents.
     */
    data: XOR<SessionEventUpdateManyMutationInput, SessionEventUncheckedUpdateManyInput>;
    /**
     * Filter which SessionEvents to update
     */
    where?: SessionEventWhereInput;
    /**
     * Limit how many SessionEvents to update.
     */
    limit?: number;
  };

  /**
   * SessionEvent updateManyAndReturn
   */
  export type SessionEventUpdateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * The data used to update SessionEvents.
     */
    data: XOR<SessionEventUpdateManyMutationInput, SessionEventUncheckedUpdateManyInput>;
    /**
     * Filter which SessionEvents to update
     */
    where?: SessionEventWhereInput;
    /**
     * Limit how many SessionEvents to update.
     */
    limit?: number;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventIncludeUpdateManyAndReturn<ExtArgs> | null;
  };

  /**
   * SessionEvent upsert
   */
  export type SessionEventUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * The filter to search for the SessionEvent to update in case it exists.
     */
    where: SessionEventWhereUniqueInput;
    /**
     * In case the SessionEvent found by the `where` argument doesn't exist, create a new SessionEvent with this data.
     */
    create: XOR<SessionEventCreateInput, SessionEventUncheckedCreateInput>;
    /**
     * In case the SessionEvent was found with the provided `where` argument, update it with this data.
     */
    update: XOR<SessionEventUpdateInput, SessionEventUncheckedUpdateInput>;
  };

  /**
   * SessionEvent delete
   */
  export type SessionEventDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
    /**
     * Filter which SessionEvent to delete.
     */
    where: SessionEventWhereUniqueInput;
  };

  /**
   * SessionEvent deleteMany
   */
  export type SessionEventDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which SessionEvents to delete
     */
    where?: SessionEventWhereInput;
    /**
     * Limit how many SessionEvents to delete.
     */
    limit?: number;
  };

  /**
   * SessionEvent without action
   */
  export type SessionEventDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the SessionEvent
     */
    select?: SessionEventSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the SessionEvent
     */
    omit?: SessionEventOmit<ExtArgs> | null;
    /**
     * Choose, which related nodes to fetch as well
     */
    include?: SessionEventInclude<ExtArgs> | null;
  };

  /**
   * Model StoredSpec
   */

  export type AggregateStoredSpec = {
    _count: StoredSpecCountAggregateOutputType | null;
    _min: StoredSpecMinAggregateOutputType | null;
    _max: StoredSpecMaxAggregateOutputType | null;
  };

  export type StoredSpecMinAggregateOutputType = {
    id: string | null;
    userId: string | null;
    prompt: string | null;
    isFavorite: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type StoredSpecMaxAggregateOutputType = {
    id: string | null;
    userId: string | null;
    prompt: string | null;
    isFavorite: boolean | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  };

  export type StoredSpecCountAggregateOutputType = {
    id: number;
    userId: number;
    prompt: number;
    spec: number;
    rawLines: number;
    isFavorite: number;
    createdAt: number;
    updatedAt: number;
    _all: number;
  };

  export type StoredSpecMinAggregateInputType = {
    id?: true;
    userId?: true;
    prompt?: true;
    isFavorite?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type StoredSpecMaxAggregateInputType = {
    id?: true;
    userId?: true;
    prompt?: true;
    isFavorite?: true;
    createdAt?: true;
    updatedAt?: true;
  };

  export type StoredSpecCountAggregateInputType = {
    id?: true;
    userId?: true;
    prompt?: true;
    spec?: true;
    rawLines?: true;
    isFavorite?: true;
    createdAt?: true;
    updatedAt?: true;
    _all?: true;
  };

  export type StoredSpecAggregateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which StoredSpec to aggregate.
     */
    where?: StoredSpecWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of StoredSpecs to fetch.
     */
    orderBy?: StoredSpecOrderByWithRelationInput | StoredSpecOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the start position
     */
    cursor?: StoredSpecWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` StoredSpecs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` StoredSpecs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Count returned StoredSpecs
     **/
    _count?: true | StoredSpecCountAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the minimum value
     **/
    _min?: StoredSpecMinAggregateInputType;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     *
     * Select which fields to find the maximum value
     **/
    _max?: StoredSpecMaxAggregateInputType;
  };

  export type GetStoredSpecAggregateType<T extends StoredSpecAggregateArgs> = {
    [P in keyof T & keyof AggregateStoredSpec]: P extends "_count" | "count"
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateStoredSpec[P]>
      : GetScalarType<T[P], AggregateStoredSpec[P]>;
  };

  export type StoredSpecGroupByArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    where?: StoredSpecWhereInput;
    orderBy?: StoredSpecOrderByWithAggregationInput | StoredSpecOrderByWithAggregationInput[];
    by: StoredSpecScalarFieldEnum[] | StoredSpecScalarFieldEnum;
    having?: StoredSpecScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: StoredSpecCountAggregateInputType | true;
    _min?: StoredSpecMinAggregateInputType;
    _max?: StoredSpecMaxAggregateInputType;
  };

  export type StoredSpecGroupByOutputType = {
    id: string;
    userId: string;
    prompt: string;
    spec: JsonValue;
    rawLines: JsonValue;
    isFavorite: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: StoredSpecCountAggregateOutputType | null;
    _min: StoredSpecMinAggregateOutputType | null;
    _max: StoredSpecMaxAggregateOutputType | null;
  };

  type GetStoredSpecGroupByPayload<T extends StoredSpecGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<StoredSpecGroupByOutputType, T["by"]> & {
        [P in keyof T & keyof StoredSpecGroupByOutputType]: P extends "_count"
          ? T[P] extends boolean
            ? number
            : GetScalarType<T[P], StoredSpecGroupByOutputType[P]>
          : GetScalarType<T[P], StoredSpecGroupByOutputType[P]>;
      }
    >
  >;

  export type StoredSpecSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetSelect<
      {
        id?: boolean;
        userId?: boolean;
        prompt?: boolean;
        spec?: boolean;
        rawLines?: boolean;
        isFavorite?: boolean;
        createdAt?: boolean;
        updatedAt?: boolean;
      },
      ExtArgs["result"]["storedSpec"]
    >;

  export type StoredSpecSelectCreateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      userId?: boolean;
      prompt?: boolean;
      spec?: boolean;
      rawLines?: boolean;
      isFavorite?: boolean;
      createdAt?: boolean;
      updatedAt?: boolean;
    },
    ExtArgs["result"]["storedSpec"]
  >;

  export type StoredSpecSelectUpdateManyAndReturn<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = $Extensions.GetSelect<
    {
      id?: boolean;
      userId?: boolean;
      prompt?: boolean;
      spec?: boolean;
      rawLines?: boolean;
      isFavorite?: boolean;
      createdAt?: boolean;
      updatedAt?: boolean;
    },
    ExtArgs["result"]["storedSpec"]
  >;

  export type StoredSpecSelectScalar = {
    id?: boolean;
    userId?: boolean;
    prompt?: boolean;
    spec?: boolean;
    rawLines?: boolean;
    isFavorite?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
  };

  export type StoredSpecOmit<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    $Extensions.GetOmit<
      "id" | "userId" | "prompt" | "spec" | "rawLines" | "isFavorite" | "createdAt" | "updatedAt",
      ExtArgs["result"]["storedSpec"]
    >;

  export type $StoredSpecPayload<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    name: "StoredSpec";
    objects: {};
    scalars: $Extensions.GetPayloadResult<
      {
        id: string;
        userId: string;
        prompt: string;
        spec: Prisma.JsonValue;
        rawLines: Prisma.JsonValue;
        isFavorite: boolean;
        createdAt: Date;
        updatedAt: Date;
      },
      ExtArgs["result"]["storedSpec"]
    >;
    composites: {};
  };

  type StoredSpecGetPayload<S extends boolean | null | undefined | StoredSpecDefaultArgs> =
    $Result.GetResult<Prisma.$StoredSpecPayload, S>;

  type StoredSpecCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> =
    Omit<StoredSpecFindManyArgs, "select" | "include" | "distinct" | "omit"> & {
      select?: StoredSpecCountAggregateInputType | true;
    };

  export interface StoredSpecDelegate<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > {
    [K: symbol]: {
      types: Prisma.TypeMap<ExtArgs>["model"]["StoredSpec"];
      meta: { name: "StoredSpec" };
    };
    /**
     * Find zero or one StoredSpec that matches the filter.
     * @param {StoredSpecFindUniqueArgs} args - Arguments to find a StoredSpec
     * @example
     * // Get one StoredSpec
     * const storedSpec = await prisma.storedSpec.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends StoredSpecFindUniqueArgs>(
      args: SelectSubset<T, StoredSpecFindUniqueArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<
        Prisma.$StoredSpecPayload<ExtArgs>,
        T,
        "findUnique",
        GlobalOmitOptions
      > | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find one StoredSpec that matches the filter or throw an error with `error.code='P2025'`
     * if no matches were found.
     * @param {StoredSpecFindUniqueOrThrowArgs} args - Arguments to find a StoredSpec
     * @example
     * // Get one StoredSpec
     * const storedSpec = await prisma.storedSpec.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends StoredSpecFindUniqueOrThrowArgs>(
      args: SelectSubset<T, StoredSpecFindUniqueOrThrowArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<
        Prisma.$StoredSpecPayload<ExtArgs>,
        T,
        "findUniqueOrThrow",
        GlobalOmitOptions
      >,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first StoredSpec that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecFindFirstArgs} args - Arguments to find a StoredSpec
     * @example
     * // Get one StoredSpec
     * const storedSpec = await prisma.storedSpec.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends StoredSpecFindFirstArgs>(
      args?: SelectSubset<T, StoredSpecFindFirstArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<
        Prisma.$StoredSpecPayload<ExtArgs>,
        T,
        "findFirst",
        GlobalOmitOptions
      > | null,
      null,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find the first StoredSpec that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecFindFirstOrThrowArgs} args - Arguments to find a StoredSpec
     * @example
     * // Get one StoredSpec
     * const storedSpec = await prisma.storedSpec.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends StoredSpecFindFirstOrThrowArgs>(
      args?: SelectSubset<T, StoredSpecFindFirstOrThrowArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<
        Prisma.$StoredSpecPayload<ExtArgs>,
        T,
        "findFirstOrThrow",
        GlobalOmitOptions
      >,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Find zero or more StoredSpecs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all StoredSpecs
     * const storedSpecs = await prisma.storedSpec.findMany()
     *
     * // Get first 10 StoredSpecs
     * const storedSpecs = await prisma.storedSpec.findMany({ take: 10 })
     *
     * // Only select the `id`
     * const storedSpecWithIdOnly = await prisma.storedSpec.findMany({ select: { id: true } })
     *
     */
    findMany<T extends StoredSpecFindManyArgs>(
      args?: SelectSubset<T, StoredSpecFindManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<Prisma.$StoredSpecPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>
    >;

    /**
     * Create a StoredSpec.
     * @param {StoredSpecCreateArgs} args - Arguments to create a StoredSpec.
     * @example
     * // Create one StoredSpec
     * const StoredSpec = await prisma.storedSpec.create({
     *   data: {
     *     // ... data to create a StoredSpec
     *   }
     * })
     *
     */
    create<T extends StoredSpecCreateArgs>(
      args: SelectSubset<T, StoredSpecCreateArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<Prisma.$StoredSpecPayload<ExtArgs>, T, "create", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Create many StoredSpecs.
     * @param {StoredSpecCreateManyArgs} args - Arguments to create many StoredSpecs.
     * @example
     * // Create many StoredSpecs
     * const storedSpec = await prisma.storedSpec.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     */
    createMany<T extends StoredSpecCreateManyArgs>(
      args?: SelectSubset<T, StoredSpecCreateManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Create many StoredSpecs and returns the data saved in the database.
     * @param {StoredSpecCreateManyAndReturnArgs} args - Arguments to create many StoredSpecs.
     * @example
     * // Create many StoredSpecs
     * const storedSpec = await prisma.storedSpec.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Create many StoredSpecs and only return the `id`
     * const storedSpecWithIdOnly = await prisma.storedSpec.createManyAndReturn({
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     *
     */
    createManyAndReturn<T extends StoredSpecCreateManyAndReturnArgs>(
      args?: SelectSubset<T, StoredSpecCreateManyAndReturnArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$StoredSpecPayload<ExtArgs>,
        T,
        "createManyAndReturn",
        GlobalOmitOptions
      >
    >;

    /**
     * Delete a StoredSpec.
     * @param {StoredSpecDeleteArgs} args - Arguments to delete one StoredSpec.
     * @example
     * // Delete one StoredSpec
     * const StoredSpec = await prisma.storedSpec.delete({
     *   where: {
     *     // ... filter to delete one StoredSpec
     *   }
     * })
     *
     */
    delete<T extends StoredSpecDeleteArgs>(
      args: SelectSubset<T, StoredSpecDeleteArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<Prisma.$StoredSpecPayload<ExtArgs>, T, "delete", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Update one StoredSpec.
     * @param {StoredSpecUpdateArgs} args - Arguments to update one StoredSpec.
     * @example
     * // Update one StoredSpec
     * const storedSpec = await prisma.storedSpec.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    update<T extends StoredSpecUpdateArgs>(
      args: SelectSubset<T, StoredSpecUpdateArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<Prisma.$StoredSpecPayload<ExtArgs>, T, "update", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Delete zero or more StoredSpecs.
     * @param {StoredSpecDeleteManyArgs} args - Arguments to filter StoredSpecs to delete.
     * @example
     * // Delete a few StoredSpecs
     * const { count } = await prisma.storedSpec.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     *
     */
    deleteMany<T extends StoredSpecDeleteManyArgs>(
      args?: SelectSubset<T, StoredSpecDeleteManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more StoredSpecs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many StoredSpecs
     * const storedSpec = await prisma.storedSpec.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     *
     */
    updateMany<T extends StoredSpecUpdateManyArgs>(
      args: SelectSubset<T, StoredSpecUpdateManyArgs<ExtArgs>>
    ): Prisma.PrismaPromise<BatchPayload>;

    /**
     * Update zero or more StoredSpecs and returns the data updated in the database.
     * @param {StoredSpecUpdateManyAndReturnArgs} args - Arguments to update many StoredSpecs.
     * @example
     * // Update many StoredSpecs
     * const storedSpec = await prisma.storedSpec.updateManyAndReturn({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *
     * // Update zero or more StoredSpecs and only return the `id`
     * const storedSpecWithIdOnly = await prisma.storedSpec.updateManyAndReturn({
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
    updateManyAndReturn<T extends StoredSpecUpdateManyAndReturnArgs>(
      args: SelectSubset<T, StoredSpecUpdateManyAndReturnArgs<ExtArgs>>
    ): Prisma.PrismaPromise<
      $Result.GetResult<
        Prisma.$StoredSpecPayload<ExtArgs>,
        T,
        "updateManyAndReturn",
        GlobalOmitOptions
      >
    >;

    /**
     * Create or update one StoredSpec.
     * @param {StoredSpecUpsertArgs} args - Arguments to update or create a StoredSpec.
     * @example
     * // Update or create a StoredSpec
     * const storedSpec = await prisma.storedSpec.upsert({
     *   create: {
     *     // ... data to create a StoredSpec
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the StoredSpec we want to update
     *   }
     * })
     */
    upsert<T extends StoredSpecUpsertArgs>(
      args: SelectSubset<T, StoredSpecUpsertArgs<ExtArgs>>
    ): Prisma__StoredSpecClient<
      $Result.GetResult<Prisma.$StoredSpecPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>,
      never,
      ExtArgs,
      GlobalOmitOptions
    >;

    /**
     * Count the number of StoredSpecs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecCountArgs} args - Arguments to filter StoredSpecs to count.
     * @example
     * // Count the number of StoredSpecs
     * const count = await prisma.storedSpec.count({
     *   where: {
     *     // ... the filter for the StoredSpecs we want to count
     *   }
     * })
     **/
    count<T extends StoredSpecCountArgs>(
      args?: Subset<T, StoredSpecCountArgs>
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<"select", any>
        ? T["select"] extends true
          ? number
          : GetScalarType<T["select"], StoredSpecCountAggregateOutputType>
        : number
    >;

    /**
     * Allows you to perform aggregations operations on a StoredSpec.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
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
    aggregate<T extends StoredSpecAggregateArgs>(
      args: Subset<T, StoredSpecAggregateArgs>
    ): Prisma.PrismaPromise<GetStoredSpecAggregateType<T>>;

    /**
     * Group by StoredSpec.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {StoredSpecGroupByArgs} args - Group by arguments.
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
      T extends StoredSpecGroupByArgs,
      HasSelectOrTake extends Or<Extends<"skip", Keys<T>>, Extends<"take", Keys<T>>>,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: StoredSpecGroupByArgs["orderBy"] }
        : { orderBy?: StoredSpecGroupByArgs["orderBy"] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T["orderBy"]>>>,
      ByFields extends MaybeTupleToUnion<T["by"]>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T["having"]>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T["by"] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
        ? `Error: "by" must not be empty.`
        : HavingValid extends False
          ? {
              [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                  ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                  : [Error, "Field ", P, ` in "having" needs to be provided in "by"`];
            }[HavingFields]
          : "take" extends Keys<T>
            ? "orderBy" extends Keys<T>
              ? ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields]
              : 'Error: If you provide "take", you also need to provide "orderBy"'
            : "skip" extends Keys<T>
              ? "orderBy" extends Keys<T>
                ? ByValid extends True
                  ? {}
                  : {
                      [P in OrderFields]: P extends ByFields
                        ? never
                        : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                    }[OrderFields]
                : 'Error: If you provide "skip", you also need to provide "orderBy"'
              : ByValid extends True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                      ? never
                      : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
                  }[OrderFields],
    >(
      args: SubsetIntersection<T, StoredSpecGroupByArgs, OrderByArg> & InputErrors
    ): {} extends InputErrors ? GetStoredSpecGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    /**
     * Fields of the StoredSpec model
     */
    readonly fields: StoredSpecFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for StoredSpec.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__StoredSpecClient<
    T,
    Null = never,
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
    GlobalOmitOptions = {},
  > extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): $Utils.JsPromise<TResult1 | TResult2>;
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(
      onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
    ): $Utils.JsPromise<T | TResult>;
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>;
  }

  /**
   * Fields of the StoredSpec model
   */
  interface StoredSpecFieldRefs {
    readonly id: FieldRef<"StoredSpec", "String">;
    readonly userId: FieldRef<"StoredSpec", "String">;
    readonly prompt: FieldRef<"StoredSpec", "String">;
    readonly spec: FieldRef<"StoredSpec", "Json">;
    readonly rawLines: FieldRef<"StoredSpec", "Json">;
    readonly isFavorite: FieldRef<"StoredSpec", "Boolean">;
    readonly createdAt: FieldRef<"StoredSpec", "DateTime">;
    readonly updatedAt: FieldRef<"StoredSpec", "DateTime">;
  }

  // Custom InputTypes
  /**
   * StoredSpec findUnique
   */
  export type StoredSpecFindUniqueArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * Filter, which StoredSpec to fetch.
     */
    where: StoredSpecWhereUniqueInput;
  };

  /**
   * StoredSpec findUniqueOrThrow
   */
  export type StoredSpecFindUniqueOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * Filter, which StoredSpec to fetch.
     */
    where: StoredSpecWhereUniqueInput;
  };

  /**
   * StoredSpec findFirst
   */
  export type StoredSpecFindFirstArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * Filter, which StoredSpec to fetch.
     */
    where?: StoredSpecWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of StoredSpecs to fetch.
     */
    orderBy?: StoredSpecOrderByWithRelationInput | StoredSpecOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for StoredSpecs.
     */
    cursor?: StoredSpecWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` StoredSpecs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` StoredSpecs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of StoredSpecs.
     */
    distinct?: StoredSpecScalarFieldEnum | StoredSpecScalarFieldEnum[];
  };

  /**
   * StoredSpec findFirstOrThrow
   */
  export type StoredSpecFindFirstOrThrowArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * Filter, which StoredSpec to fetch.
     */
    where?: StoredSpecWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of StoredSpecs to fetch.
     */
    orderBy?: StoredSpecOrderByWithRelationInput | StoredSpecOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for searching for StoredSpecs.
     */
    cursor?: StoredSpecWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` StoredSpecs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` StoredSpecs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of StoredSpecs.
     */
    distinct?: StoredSpecScalarFieldEnum | StoredSpecScalarFieldEnum[];
  };

  /**
   * StoredSpec findMany
   */
  export type StoredSpecFindManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * Filter, which StoredSpecs to fetch.
     */
    where?: StoredSpecWhereInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     *
     * Determine the order of StoredSpecs to fetch.
     */
    orderBy?: StoredSpecOrderByWithRelationInput | StoredSpecOrderByWithRelationInput[];
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     *
     * Sets the position for listing StoredSpecs.
     */
    cursor?: StoredSpecWhereUniqueInput;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Take `±n` StoredSpecs from the position of the cursor.
     */
    take?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     *
     * Skip the first `n` StoredSpecs.
     */
    skip?: number;
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     *
     * Filter by unique combinations of StoredSpecs.
     */
    distinct?: StoredSpecScalarFieldEnum | StoredSpecScalarFieldEnum[];
  };

  /**
   * StoredSpec create
   */
  export type StoredSpecCreateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * The data needed to create a StoredSpec.
     */
    data: XOR<StoredSpecCreateInput, StoredSpecUncheckedCreateInput>;
  };

  /**
   * StoredSpec createMany
   */
  export type StoredSpecCreateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to create many StoredSpecs.
     */
    data: StoredSpecCreateManyInput | StoredSpecCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * StoredSpec createManyAndReturn
   */
  export type StoredSpecCreateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelectCreateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * The data used to create many StoredSpecs.
     */
    data: StoredSpecCreateManyInput | StoredSpecCreateManyInput[];
    skipDuplicates?: boolean;
  };

  /**
   * StoredSpec update
   */
  export type StoredSpecUpdateArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * The data needed to update a StoredSpec.
     */
    data: XOR<StoredSpecUpdateInput, StoredSpecUncheckedUpdateInput>;
    /**
     * Choose, which StoredSpec to update.
     */
    where: StoredSpecWhereUniqueInput;
  };

  /**
   * StoredSpec updateMany
   */
  export type StoredSpecUpdateManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * The data used to update StoredSpecs.
     */
    data: XOR<StoredSpecUpdateManyMutationInput, StoredSpecUncheckedUpdateManyInput>;
    /**
     * Filter which StoredSpecs to update
     */
    where?: StoredSpecWhereInput;
    /**
     * Limit how many StoredSpecs to update.
     */
    limit?: number;
  };

  /**
   * StoredSpec updateManyAndReturn
   */
  export type StoredSpecUpdateManyAndReturnArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelectUpdateManyAndReturn<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * The data used to update StoredSpecs.
     */
    data: XOR<StoredSpecUpdateManyMutationInput, StoredSpecUncheckedUpdateManyInput>;
    /**
     * Filter which StoredSpecs to update
     */
    where?: StoredSpecWhereInput;
    /**
     * Limit how many StoredSpecs to update.
     */
    limit?: number;
  };

  /**
   * StoredSpec upsert
   */
  export type StoredSpecUpsertArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * The filter to search for the StoredSpec to update in case it exists.
     */
    where: StoredSpecWhereUniqueInput;
    /**
     * In case the StoredSpec found by the `where` argument doesn't exist, create a new StoredSpec with this data.
     */
    create: XOR<StoredSpecCreateInput, StoredSpecUncheckedCreateInput>;
    /**
     * In case the StoredSpec was found with the provided `where` argument, update it with this data.
     */
    update: XOR<StoredSpecUpdateInput, StoredSpecUncheckedUpdateInput>;
  };

  /**
   * StoredSpec delete
   */
  export type StoredSpecDeleteArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
    /**
     * Filter which StoredSpec to delete.
     */
    where: StoredSpecWhereUniqueInput;
  };

  /**
   * StoredSpec deleteMany
   */
  export type StoredSpecDeleteManyArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Filter which StoredSpecs to delete
     */
    where?: StoredSpecWhereInput;
    /**
     * Limit how many StoredSpecs to delete.
     */
    limit?: number;
  };

  /**
   * StoredSpec without action
   */
  export type StoredSpecDefaultArgs<
    ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs,
  > = {
    /**
     * Select specific fields to fetch from the StoredSpec
     */
    select?: StoredSpecSelect<ExtArgs> | null;
    /**
     * Omit specific fields from the StoredSpec
     */
    omit?: StoredSpecOmit<ExtArgs> | null;
  };

  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: "ReadUncommitted";
    ReadCommitted: "ReadCommitted";
    RepeatableRead: "RepeatableRead";
    Serializable: "Serializable";
  };

  export type TransactionIsolationLevel =
    (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel];

  export const SessionScalarFieldEnum: {
    id: "id";
    status: "status";
    taskDescription: "taskDescription";
    userId: "userId";
    branchName: "branchName";
    baseBranch: "baseBranch";
    model: "model";
    maxTurns: "maxTurns";
    maxBudgetUsd: "maxBudgetUsd";
    createPr: "createPr";
    prUrl: "prUrl";
    prNumber: "prNumber";
    resultText: "resultText";
    costUsd: "costUsd";
    inputTokens: "inputTokens";
    outputTokens: "outputTokens";
    numTurns: "numTurns";
    durationMs: "durationMs";
    errors: "errors";
    failureCategory: "failureCategory";
    sdkSessionId: "sdkSessionId";
    startedAt: "startedAt";
    completedAt: "completedAt";
    createdAt: "createdAt";
    updatedAt: "updatedAt";
    parentId: "parentId";
  };

  export type SessionScalarFieldEnum =
    (typeof SessionScalarFieldEnum)[keyof typeof SessionScalarFieldEnum];

  export const SessionEventScalarFieldEnum: {
    id: "id";
    sessionId: "sessionId";
    type: "type";
    data: "data";
    createdAt: "createdAt";
    turnIndex: "turnIndex";
    inputTokens: "inputTokens";
    outputTokens: "outputTokens";
    thinkingTokens: "thinkingTokens";
    costUsd: "costUsd";
    modelId: "modelId";
    toolName: "toolName";
    toolUseId: "toolUseId";
    toolLatencyMs: "toolLatencyMs";
    toolIsError: "toolIsError";
  };

  export type SessionEventScalarFieldEnum =
    (typeof SessionEventScalarFieldEnum)[keyof typeof SessionEventScalarFieldEnum];

  export const StoredSpecScalarFieldEnum: {
    id: "id";
    userId: "userId";
    prompt: "prompt";
    spec: "spec";
    rawLines: "rawLines";
    isFavorite: "isFavorite";
    createdAt: "createdAt";
    updatedAt: "updatedAt";
  };

  export type StoredSpecScalarFieldEnum =
    (typeof StoredSpecScalarFieldEnum)[keyof typeof StoredSpecScalarFieldEnum];

  export const SortOrder: {
    asc: "asc";
    desc: "desc";
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

  export const JsonNullValueInput: {
    JsonNull: typeof JsonNull;
  };

  export type JsonNullValueInput = (typeof JsonNullValueInput)[keyof typeof JsonNullValueInput];

  export const QueryMode: {
    default: "default";
    insensitive: "insensitive";
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];

  export const JsonNullValueFilter: {
    DbNull: typeof DbNull;
    JsonNull: typeof JsonNull;
    AnyNull: typeof AnyNull;
  };

  export type JsonNullValueFilter = (typeof JsonNullValueFilter)[keyof typeof JsonNullValueFilter];

  export const NullsOrder: {
    first: "first";
    last: "last";
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder];

  /**
   * Field references
   */

  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "String">;

  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "String[]">;

  /**
   * Reference to a field of type 'SessionStatus'
   */
  export type EnumSessionStatusFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "SessionStatus"
  >;

  /**
   * Reference to a field of type 'SessionStatus[]'
   */
  export type ListEnumSessionStatusFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "SessionStatus[]"
  >;

  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "Int">;

  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "Int[]">;

  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "Float">;

  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "Float[]">;

  /**
   * Reference to a field of type 'Boolean'
   */
  export type BooleanFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "Boolean">;

  /**
   * Reference to a field of type 'Json'
   */
  export type JsonFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "Json">;

  /**
   * Reference to a field of type 'QueryMode'
   */
  export type EnumQueryModeFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "QueryMode"
  >;

  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, "DateTime">;

  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<
    $PrismaModel,
    "DateTime[]"
  >;

  /**
   * Deep Input Types
   */

  export type SessionWhereInput = {
    AND?: SessionWhereInput | SessionWhereInput[];
    OR?: SessionWhereInput[];
    NOT?: SessionWhereInput | SessionWhereInput[];
    id?: StringFilter<"Session"> | string;
    status?: EnumSessionStatusFilter<"Session"> | $Enums.SessionStatus;
    taskDescription?: StringFilter<"Session"> | string;
    userId?: StringNullableFilter<"Session"> | string | null;
    branchName?: StringNullableFilter<"Session"> | string | null;
    baseBranch?: StringFilter<"Session"> | string;
    model?: StringFilter<"Session"> | string;
    maxTurns?: IntFilter<"Session"> | number;
    maxBudgetUsd?: FloatFilter<"Session"> | number;
    createPr?: BoolFilter<"Session"> | boolean;
    prUrl?: StringNullableFilter<"Session"> | string | null;
    prNumber?: IntNullableFilter<"Session"> | number | null;
    resultText?: StringNullableFilter<"Session"> | string | null;
    costUsd?: FloatNullableFilter<"Session"> | number | null;
    inputTokens?: IntNullableFilter<"Session"> | number | null;
    outputTokens?: IntNullableFilter<"Session"> | number | null;
    numTurns?: IntNullableFilter<"Session"> | number | null;
    durationMs?: IntNullableFilter<"Session"> | number | null;
    errors?: JsonFilter<"Session">;
    failureCategory?: StringNullableFilter<"Session"> | string | null;
    sdkSessionId?: StringNullableFilter<"Session"> | string | null;
    startedAt?: DateTimeNullableFilter<"Session"> | Date | string | null;
    completedAt?: DateTimeNullableFilter<"Session"> | Date | string | null;
    createdAt?: DateTimeFilter<"Session"> | Date | string;
    updatedAt?: DateTimeFilter<"Session"> | Date | string;
    parentId?: StringNullableFilter<"Session"> | string | null;
    parent?: XOR<SessionNullableScalarRelationFilter, SessionWhereInput> | null;
    children?: SessionListRelationFilter;
    events?: SessionEventListRelationFilter;
  };

  export type SessionOrderByWithRelationInput = {
    id?: SortOrder;
    status?: SortOrder;
    taskDescription?: SortOrder;
    userId?: SortOrderInput | SortOrder;
    branchName?: SortOrderInput | SortOrder;
    baseBranch?: SortOrder;
    model?: SortOrder;
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    createPr?: SortOrder;
    prUrl?: SortOrderInput | SortOrder;
    prNumber?: SortOrderInput | SortOrder;
    resultText?: SortOrderInput | SortOrder;
    costUsd?: SortOrderInput | SortOrder;
    inputTokens?: SortOrderInput | SortOrder;
    outputTokens?: SortOrderInput | SortOrder;
    numTurns?: SortOrderInput | SortOrder;
    durationMs?: SortOrderInput | SortOrder;
    errors?: SortOrder;
    failureCategory?: SortOrderInput | SortOrder;
    sdkSessionId?: SortOrderInput | SortOrder;
    startedAt?: SortOrderInput | SortOrder;
    completedAt?: SortOrderInput | SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    parentId?: SortOrderInput | SortOrder;
    parent?: SessionOrderByWithRelationInput;
    children?: SessionOrderByRelationAggregateInput;
    events?: SessionEventOrderByRelationAggregateInput;
  };

  export type SessionWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: SessionWhereInput | SessionWhereInput[];
      OR?: SessionWhereInput[];
      NOT?: SessionWhereInput | SessionWhereInput[];
      status?: EnumSessionStatusFilter<"Session"> | $Enums.SessionStatus;
      taskDescription?: StringFilter<"Session"> | string;
      userId?: StringNullableFilter<"Session"> | string | null;
      branchName?: StringNullableFilter<"Session"> | string | null;
      baseBranch?: StringFilter<"Session"> | string;
      model?: StringFilter<"Session"> | string;
      maxTurns?: IntFilter<"Session"> | number;
      maxBudgetUsd?: FloatFilter<"Session"> | number;
      createPr?: BoolFilter<"Session"> | boolean;
      prUrl?: StringNullableFilter<"Session"> | string | null;
      prNumber?: IntNullableFilter<"Session"> | number | null;
      resultText?: StringNullableFilter<"Session"> | string | null;
      costUsd?: FloatNullableFilter<"Session"> | number | null;
      inputTokens?: IntNullableFilter<"Session"> | number | null;
      outputTokens?: IntNullableFilter<"Session"> | number | null;
      numTurns?: IntNullableFilter<"Session"> | number | null;
      durationMs?: IntNullableFilter<"Session"> | number | null;
      errors?: JsonFilter<"Session">;
      failureCategory?: StringNullableFilter<"Session"> | string | null;
      sdkSessionId?: StringNullableFilter<"Session"> | string | null;
      startedAt?: DateTimeNullableFilter<"Session"> | Date | string | null;
      completedAt?: DateTimeNullableFilter<"Session"> | Date | string | null;
      createdAt?: DateTimeFilter<"Session"> | Date | string;
      updatedAt?: DateTimeFilter<"Session"> | Date | string;
      parentId?: StringNullableFilter<"Session"> | string | null;
      parent?: XOR<SessionNullableScalarRelationFilter, SessionWhereInput> | null;
      children?: SessionListRelationFilter;
      events?: SessionEventListRelationFilter;
    },
    "id"
  >;

  export type SessionOrderByWithAggregationInput = {
    id?: SortOrder;
    status?: SortOrder;
    taskDescription?: SortOrder;
    userId?: SortOrderInput | SortOrder;
    branchName?: SortOrderInput | SortOrder;
    baseBranch?: SortOrder;
    model?: SortOrder;
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    createPr?: SortOrder;
    prUrl?: SortOrderInput | SortOrder;
    prNumber?: SortOrderInput | SortOrder;
    resultText?: SortOrderInput | SortOrder;
    costUsd?: SortOrderInput | SortOrder;
    inputTokens?: SortOrderInput | SortOrder;
    outputTokens?: SortOrderInput | SortOrder;
    numTurns?: SortOrderInput | SortOrder;
    durationMs?: SortOrderInput | SortOrder;
    errors?: SortOrder;
    failureCategory?: SortOrderInput | SortOrder;
    sdkSessionId?: SortOrderInput | SortOrder;
    startedAt?: SortOrderInput | SortOrder;
    completedAt?: SortOrderInput | SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    parentId?: SortOrderInput | SortOrder;
    _count?: SessionCountOrderByAggregateInput;
    _avg?: SessionAvgOrderByAggregateInput;
    _max?: SessionMaxOrderByAggregateInput;
    _min?: SessionMinOrderByAggregateInput;
    _sum?: SessionSumOrderByAggregateInput;
  };

  export type SessionScalarWhereWithAggregatesInput = {
    AND?: SessionScalarWhereWithAggregatesInput | SessionScalarWhereWithAggregatesInput[];
    OR?: SessionScalarWhereWithAggregatesInput[];
    NOT?: SessionScalarWhereWithAggregatesInput | SessionScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"Session"> | string;
    status?: EnumSessionStatusWithAggregatesFilter<"Session"> | $Enums.SessionStatus;
    taskDescription?: StringWithAggregatesFilter<"Session"> | string;
    userId?: StringNullableWithAggregatesFilter<"Session"> | string | null;
    branchName?: StringNullableWithAggregatesFilter<"Session"> | string | null;
    baseBranch?: StringWithAggregatesFilter<"Session"> | string;
    model?: StringWithAggregatesFilter<"Session"> | string;
    maxTurns?: IntWithAggregatesFilter<"Session"> | number;
    maxBudgetUsd?: FloatWithAggregatesFilter<"Session"> | number;
    createPr?: BoolWithAggregatesFilter<"Session"> | boolean;
    prUrl?: StringNullableWithAggregatesFilter<"Session"> | string | null;
    prNumber?: IntNullableWithAggregatesFilter<"Session"> | number | null;
    resultText?: StringNullableWithAggregatesFilter<"Session"> | string | null;
    costUsd?: FloatNullableWithAggregatesFilter<"Session"> | number | null;
    inputTokens?: IntNullableWithAggregatesFilter<"Session"> | number | null;
    outputTokens?: IntNullableWithAggregatesFilter<"Session"> | number | null;
    numTurns?: IntNullableWithAggregatesFilter<"Session"> | number | null;
    durationMs?: IntNullableWithAggregatesFilter<"Session"> | number | null;
    errors?: JsonWithAggregatesFilter<"Session">;
    failureCategory?: StringNullableWithAggregatesFilter<"Session"> | string | null;
    sdkSessionId?: StringNullableWithAggregatesFilter<"Session"> | string | null;
    startedAt?: DateTimeNullableWithAggregatesFilter<"Session"> | Date | string | null;
    completedAt?: DateTimeNullableWithAggregatesFilter<"Session"> | Date | string | null;
    createdAt?: DateTimeWithAggregatesFilter<"Session"> | Date | string;
    updatedAt?: DateTimeWithAggregatesFilter<"Session"> | Date | string;
    parentId?: StringNullableWithAggregatesFilter<"Session"> | string | null;
  };

  export type SessionEventWhereInput = {
    AND?: SessionEventWhereInput | SessionEventWhereInput[];
    OR?: SessionEventWhereInput[];
    NOT?: SessionEventWhereInput | SessionEventWhereInput[];
    id?: StringFilter<"SessionEvent"> | string;
    sessionId?: StringFilter<"SessionEvent"> | string;
    type?: StringFilter<"SessionEvent"> | string;
    data?: JsonFilter<"SessionEvent">;
    createdAt?: DateTimeFilter<"SessionEvent"> | Date | string;
    turnIndex?: IntNullableFilter<"SessionEvent"> | number | null;
    inputTokens?: IntNullableFilter<"SessionEvent"> | number | null;
    outputTokens?: IntNullableFilter<"SessionEvent"> | number | null;
    thinkingTokens?: IntNullableFilter<"SessionEvent"> | number | null;
    costUsd?: FloatNullableFilter<"SessionEvent"> | number | null;
    modelId?: StringNullableFilter<"SessionEvent"> | string | null;
    toolName?: StringNullableFilter<"SessionEvent"> | string | null;
    toolUseId?: StringNullableFilter<"SessionEvent"> | string | null;
    toolLatencyMs?: IntNullableFilter<"SessionEvent"> | number | null;
    toolIsError?: BoolNullableFilter<"SessionEvent"> | boolean | null;
    session?: XOR<SessionScalarRelationFilter, SessionWhereInput>;
  };

  export type SessionEventOrderByWithRelationInput = {
    id?: SortOrder;
    sessionId?: SortOrder;
    type?: SortOrder;
    data?: SortOrder;
    createdAt?: SortOrder;
    turnIndex?: SortOrderInput | SortOrder;
    inputTokens?: SortOrderInput | SortOrder;
    outputTokens?: SortOrderInput | SortOrder;
    thinkingTokens?: SortOrderInput | SortOrder;
    costUsd?: SortOrderInput | SortOrder;
    modelId?: SortOrderInput | SortOrder;
    toolName?: SortOrderInput | SortOrder;
    toolUseId?: SortOrderInput | SortOrder;
    toolLatencyMs?: SortOrderInput | SortOrder;
    toolIsError?: SortOrderInput | SortOrder;
    session?: SessionOrderByWithRelationInput;
  };

  export type SessionEventWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: SessionEventWhereInput | SessionEventWhereInput[];
      OR?: SessionEventWhereInput[];
      NOT?: SessionEventWhereInput | SessionEventWhereInput[];
      sessionId?: StringFilter<"SessionEvent"> | string;
      type?: StringFilter<"SessionEvent"> | string;
      data?: JsonFilter<"SessionEvent">;
      createdAt?: DateTimeFilter<"SessionEvent"> | Date | string;
      turnIndex?: IntNullableFilter<"SessionEvent"> | number | null;
      inputTokens?: IntNullableFilter<"SessionEvent"> | number | null;
      outputTokens?: IntNullableFilter<"SessionEvent"> | number | null;
      thinkingTokens?: IntNullableFilter<"SessionEvent"> | number | null;
      costUsd?: FloatNullableFilter<"SessionEvent"> | number | null;
      modelId?: StringNullableFilter<"SessionEvent"> | string | null;
      toolName?: StringNullableFilter<"SessionEvent"> | string | null;
      toolUseId?: StringNullableFilter<"SessionEvent"> | string | null;
      toolLatencyMs?: IntNullableFilter<"SessionEvent"> | number | null;
      toolIsError?: BoolNullableFilter<"SessionEvent"> | boolean | null;
      session?: XOR<SessionScalarRelationFilter, SessionWhereInput>;
    },
    "id"
  >;

  export type SessionEventOrderByWithAggregationInput = {
    id?: SortOrder;
    sessionId?: SortOrder;
    type?: SortOrder;
    data?: SortOrder;
    createdAt?: SortOrder;
    turnIndex?: SortOrderInput | SortOrder;
    inputTokens?: SortOrderInput | SortOrder;
    outputTokens?: SortOrderInput | SortOrder;
    thinkingTokens?: SortOrderInput | SortOrder;
    costUsd?: SortOrderInput | SortOrder;
    modelId?: SortOrderInput | SortOrder;
    toolName?: SortOrderInput | SortOrder;
    toolUseId?: SortOrderInput | SortOrder;
    toolLatencyMs?: SortOrderInput | SortOrder;
    toolIsError?: SortOrderInput | SortOrder;
    _count?: SessionEventCountOrderByAggregateInput;
    _avg?: SessionEventAvgOrderByAggregateInput;
    _max?: SessionEventMaxOrderByAggregateInput;
    _min?: SessionEventMinOrderByAggregateInput;
    _sum?: SessionEventSumOrderByAggregateInput;
  };

  export type SessionEventScalarWhereWithAggregatesInput = {
    AND?: SessionEventScalarWhereWithAggregatesInput | SessionEventScalarWhereWithAggregatesInput[];
    OR?: SessionEventScalarWhereWithAggregatesInput[];
    NOT?: SessionEventScalarWhereWithAggregatesInput | SessionEventScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"SessionEvent"> | string;
    sessionId?: StringWithAggregatesFilter<"SessionEvent"> | string;
    type?: StringWithAggregatesFilter<"SessionEvent"> | string;
    data?: JsonWithAggregatesFilter<"SessionEvent">;
    createdAt?: DateTimeWithAggregatesFilter<"SessionEvent"> | Date | string;
    turnIndex?: IntNullableWithAggregatesFilter<"SessionEvent"> | number | null;
    inputTokens?: IntNullableWithAggregatesFilter<"SessionEvent"> | number | null;
    outputTokens?: IntNullableWithAggregatesFilter<"SessionEvent"> | number | null;
    thinkingTokens?: IntNullableWithAggregatesFilter<"SessionEvent"> | number | null;
    costUsd?: FloatNullableWithAggregatesFilter<"SessionEvent"> | number | null;
    modelId?: StringNullableWithAggregatesFilter<"SessionEvent"> | string | null;
    toolName?: StringNullableWithAggregatesFilter<"SessionEvent"> | string | null;
    toolUseId?: StringNullableWithAggregatesFilter<"SessionEvent"> | string | null;
    toolLatencyMs?: IntNullableWithAggregatesFilter<"SessionEvent"> | number | null;
    toolIsError?: BoolNullableWithAggregatesFilter<"SessionEvent"> | boolean | null;
  };

  export type StoredSpecWhereInput = {
    AND?: StoredSpecWhereInput | StoredSpecWhereInput[];
    OR?: StoredSpecWhereInput[];
    NOT?: StoredSpecWhereInput | StoredSpecWhereInput[];
    id?: StringFilter<"StoredSpec"> | string;
    userId?: StringFilter<"StoredSpec"> | string;
    prompt?: StringFilter<"StoredSpec"> | string;
    spec?: JsonFilter<"StoredSpec">;
    rawLines?: JsonFilter<"StoredSpec">;
    isFavorite?: BoolFilter<"StoredSpec"> | boolean;
    createdAt?: DateTimeFilter<"StoredSpec"> | Date | string;
    updatedAt?: DateTimeFilter<"StoredSpec"> | Date | string;
  };

  export type StoredSpecOrderByWithRelationInput = {
    id?: SortOrder;
    userId?: SortOrder;
    prompt?: SortOrder;
    spec?: SortOrder;
    rawLines?: SortOrder;
    isFavorite?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type StoredSpecWhereUniqueInput = Prisma.AtLeast<
    {
      id?: string;
      AND?: StoredSpecWhereInput | StoredSpecWhereInput[];
      OR?: StoredSpecWhereInput[];
      NOT?: StoredSpecWhereInput | StoredSpecWhereInput[];
      userId?: StringFilter<"StoredSpec"> | string;
      prompt?: StringFilter<"StoredSpec"> | string;
      spec?: JsonFilter<"StoredSpec">;
      rawLines?: JsonFilter<"StoredSpec">;
      isFavorite?: BoolFilter<"StoredSpec"> | boolean;
      createdAt?: DateTimeFilter<"StoredSpec"> | Date | string;
      updatedAt?: DateTimeFilter<"StoredSpec"> | Date | string;
    },
    "id"
  >;

  export type StoredSpecOrderByWithAggregationInput = {
    id?: SortOrder;
    userId?: SortOrder;
    prompt?: SortOrder;
    spec?: SortOrder;
    rawLines?: SortOrder;
    isFavorite?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    _count?: StoredSpecCountOrderByAggregateInput;
    _max?: StoredSpecMaxOrderByAggregateInput;
    _min?: StoredSpecMinOrderByAggregateInput;
  };

  export type StoredSpecScalarWhereWithAggregatesInput = {
    AND?: StoredSpecScalarWhereWithAggregatesInput | StoredSpecScalarWhereWithAggregatesInput[];
    OR?: StoredSpecScalarWhereWithAggregatesInput[];
    NOT?: StoredSpecScalarWhereWithAggregatesInput | StoredSpecScalarWhereWithAggregatesInput[];
    id?: StringWithAggregatesFilter<"StoredSpec"> | string;
    userId?: StringWithAggregatesFilter<"StoredSpec"> | string;
    prompt?: StringWithAggregatesFilter<"StoredSpec"> | string;
    spec?: JsonWithAggregatesFilter<"StoredSpec">;
    rawLines?: JsonWithAggregatesFilter<"StoredSpec">;
    isFavorite?: BoolWithAggregatesFilter<"StoredSpec"> | boolean;
    createdAt?: DateTimeWithAggregatesFilter<"StoredSpec"> | Date | string;
    updatedAt?: DateTimeWithAggregatesFilter<"StoredSpec"> | Date | string;
  };

  export type SessionCreateInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parent?: SessionCreateNestedOneWithoutChildrenInput;
    children?: SessionCreateNestedManyWithoutParentInput;
    events?: SessionEventCreateNestedManyWithoutSessionInput;
  };

  export type SessionUncheckedCreateInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parentId?: string | null;
    children?: SessionUncheckedCreateNestedManyWithoutParentInput;
    events?: SessionEventUncheckedCreateNestedManyWithoutSessionInput;
  };

  export type SessionUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parent?: SessionUpdateOneWithoutChildrenNestedInput;
    children?: SessionUpdateManyWithoutParentNestedInput;
    events?: SessionEventUpdateManyWithoutSessionNestedInput;
  };

  export type SessionUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parentId?: NullableStringFieldUpdateOperationsInput | string | null;
    children?: SessionUncheckedUpdateManyWithoutParentNestedInput;
    events?: SessionEventUncheckedUpdateManyWithoutSessionNestedInput;
  };

  export type SessionCreateManyInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parentId?: string | null;
  };

  export type SessionUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type SessionUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parentId?: NullableStringFieldUpdateOperationsInput | string | null;
  };

  export type SessionEventCreateInput = {
    id?: string;
    type: string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: Date | string;
    turnIndex?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    thinkingTokens?: number | null;
    costUsd?: number | null;
    modelId?: string | null;
    toolName?: string | null;
    toolUseId?: string | null;
    toolLatencyMs?: number | null;
    toolIsError?: boolean | null;
    session: SessionCreateNestedOneWithoutEventsInput;
  };

  export type SessionEventUncheckedCreateInput = {
    id?: string;
    sessionId: string;
    type: string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: Date | string;
    turnIndex?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    thinkingTokens?: number | null;
    costUsd?: number | null;
    modelId?: string | null;
    toolName?: string | null;
    toolUseId?: string | null;
    toolLatencyMs?: number | null;
    toolIsError?: boolean | null;
  };

  export type SessionEventUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
    session?: SessionUpdateOneRequiredWithoutEventsNestedInput;
  };

  export type SessionEventUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    sessionId?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
  };

  export type SessionEventCreateManyInput = {
    id?: string;
    sessionId: string;
    type: string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: Date | string;
    turnIndex?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    thinkingTokens?: number | null;
    costUsd?: number | null;
    modelId?: string | null;
    toolName?: string | null;
    toolUseId?: string | null;
    toolLatencyMs?: number | null;
    toolIsError?: boolean | null;
  };

  export type SessionEventUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
  };

  export type SessionEventUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    sessionId?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
  };

  export type StoredSpecCreateInput = {
    id?: string;
    userId: string;
    prompt: string;
    spec: JsonNullValueInput | InputJsonValue;
    rawLines: JsonNullValueInput | InputJsonValue;
    isFavorite?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type StoredSpecUncheckedCreateInput = {
    id?: string;
    userId: string;
    prompt: string;
    spec: JsonNullValueInput | InputJsonValue;
    rawLines: JsonNullValueInput | InputJsonValue;
    isFavorite?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type StoredSpecUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    userId?: StringFieldUpdateOperationsInput | string;
    prompt?: StringFieldUpdateOperationsInput | string;
    spec?: JsonNullValueInput | InputJsonValue;
    rawLines?: JsonNullValueInput | InputJsonValue;
    isFavorite?: BoolFieldUpdateOperationsInput | boolean;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type StoredSpecUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string;
    userId?: StringFieldUpdateOperationsInput | string;
    prompt?: StringFieldUpdateOperationsInput | string;
    spec?: JsonNullValueInput | InputJsonValue;
    rawLines?: JsonNullValueInput | InputJsonValue;
    isFavorite?: BoolFieldUpdateOperationsInput | boolean;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type StoredSpecCreateManyInput = {
    id?: string;
    userId: string;
    prompt: string;
    spec: JsonNullValueInput | InputJsonValue;
    rawLines: JsonNullValueInput | InputJsonValue;
    isFavorite?: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type StoredSpecUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string;
    userId?: StringFieldUpdateOperationsInput | string;
    prompt?: StringFieldUpdateOperationsInput | string;
    spec?: JsonNullValueInput | InputJsonValue;
    rawLines?: JsonNullValueInput | InputJsonValue;
    isFavorite?: BoolFieldUpdateOperationsInput | boolean;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type StoredSpecUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string;
    userId?: StringFieldUpdateOperationsInput | string;
    prompt?: StringFieldUpdateOperationsInput | string;
    spec?: JsonNullValueInput | InputJsonValue;
    rawLines?: JsonNullValueInput | InputJsonValue;
    isFavorite?: BoolFieldUpdateOperationsInput | boolean;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringFilter<$PrismaModel> | string;
  };

  export type EnumSessionStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.SessionStatus | EnumSessionStatusFieldRefInput<$PrismaModel>;
    in?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    notIn?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    not?: NestedEnumSessionStatusFilter<$PrismaModel> | $Enums.SessionStatus;
  };

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringNullableFilter<$PrismaModel> | string | null;
  };

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntFilter<$PrismaModel> | number;
  };

  export type FloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatFilter<$PrismaModel> | number;
  };

  export type BoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>;
    not?: NestedBoolFilter<$PrismaModel> | boolean;
  };

  export type IntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntNullableFilter<$PrismaModel> | number | null;
  };

  export type FloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null;
  };
  export type JsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<
          Required<JsonFilterBase<$PrismaModel>>,
          Exclude<keyof Required<JsonFilterBase<$PrismaModel>>, "path">
        >,
        Required<JsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonFilterBase<$PrismaModel>>, "path">>;

  export type JsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter;
    path?: string[];
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>;
    string_contains?: string | StringFieldRefInput<$PrismaModel>;
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>;
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>;
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter;
  };

  export type DateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null;
  };

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string;
  };

  export type SessionNullableScalarRelationFilter = {
    is?: SessionWhereInput | null;
    isNot?: SessionWhereInput | null;
  };

  export type SessionListRelationFilter = {
    every?: SessionWhereInput;
    some?: SessionWhereInput;
    none?: SessionWhereInput;
  };

  export type SessionEventListRelationFilter = {
    every?: SessionEventWhereInput;
    some?: SessionEventWhereInput;
    none?: SessionEventWhereInput;
  };

  export type SortOrderInput = {
    sort: SortOrder;
    nulls?: NullsOrder;
  };

  export type SessionOrderByRelationAggregateInput = {
    _count?: SortOrder;
  };

  export type SessionEventOrderByRelationAggregateInput = {
    _count?: SortOrder;
  };

  export type SessionCountOrderByAggregateInput = {
    id?: SortOrder;
    status?: SortOrder;
    taskDescription?: SortOrder;
    userId?: SortOrder;
    branchName?: SortOrder;
    baseBranch?: SortOrder;
    model?: SortOrder;
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    createPr?: SortOrder;
    prUrl?: SortOrder;
    prNumber?: SortOrder;
    resultText?: SortOrder;
    costUsd?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    numTurns?: SortOrder;
    durationMs?: SortOrder;
    errors?: SortOrder;
    failureCategory?: SortOrder;
    sdkSessionId?: SortOrder;
    startedAt?: SortOrder;
    completedAt?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    parentId?: SortOrder;
  };

  export type SessionAvgOrderByAggregateInput = {
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    prNumber?: SortOrder;
    costUsd?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    numTurns?: SortOrder;
    durationMs?: SortOrder;
  };

  export type SessionMaxOrderByAggregateInput = {
    id?: SortOrder;
    status?: SortOrder;
    taskDescription?: SortOrder;
    userId?: SortOrder;
    branchName?: SortOrder;
    baseBranch?: SortOrder;
    model?: SortOrder;
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    createPr?: SortOrder;
    prUrl?: SortOrder;
    prNumber?: SortOrder;
    resultText?: SortOrder;
    costUsd?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    numTurns?: SortOrder;
    durationMs?: SortOrder;
    failureCategory?: SortOrder;
    sdkSessionId?: SortOrder;
    startedAt?: SortOrder;
    completedAt?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    parentId?: SortOrder;
  };

  export type SessionMinOrderByAggregateInput = {
    id?: SortOrder;
    status?: SortOrder;
    taskDescription?: SortOrder;
    userId?: SortOrder;
    branchName?: SortOrder;
    baseBranch?: SortOrder;
    model?: SortOrder;
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    createPr?: SortOrder;
    prUrl?: SortOrder;
    prNumber?: SortOrder;
    resultText?: SortOrder;
    costUsd?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    numTurns?: SortOrder;
    durationMs?: SortOrder;
    failureCategory?: SortOrder;
    sdkSessionId?: SortOrder;
    startedAt?: SortOrder;
    completedAt?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
    parentId?: SortOrder;
  };

  export type SessionSumOrderByAggregateInput = {
    maxTurns?: SortOrder;
    maxBudgetUsd?: SortOrder;
    prNumber?: SortOrder;
    costUsd?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    numTurns?: SortOrder;
    durationMs?: SortOrder;
  };

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedStringFilter<$PrismaModel>;
    _max?: NestedStringFilter<$PrismaModel>;
  };

  export type EnumSessionStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SessionStatus | EnumSessionStatusFieldRefInput<$PrismaModel>;
    in?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    notIn?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    not?: NestedEnumSessionStatusWithAggregatesFilter<$PrismaModel> | $Enums.SessionStatus;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedEnumSessionStatusFilter<$PrismaModel>;
    _max?: NestedEnumSessionStatusFilter<$PrismaModel>;
  };

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    mode?: QueryMode;
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedStringNullableFilter<$PrismaModel>;
    _max?: NestedStringNullableFilter<$PrismaModel>;
  };

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number;
    _count?: NestedIntFilter<$PrismaModel>;
    _avg?: NestedFloatFilter<$PrismaModel>;
    _sum?: NestedIntFilter<$PrismaModel>;
    _min?: NestedIntFilter<$PrismaModel>;
    _max?: NestedIntFilter<$PrismaModel>;
  };

  export type FloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number;
    _count?: NestedIntFilter<$PrismaModel>;
    _avg?: NestedFloatFilter<$PrismaModel>;
    _sum?: NestedFloatFilter<$PrismaModel>;
    _min?: NestedFloatFilter<$PrismaModel>;
    _max?: NestedFloatFilter<$PrismaModel>;
  };

  export type BoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>;
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedBoolFilter<$PrismaModel>;
    _max?: NestedBoolFilter<$PrismaModel>;
  };

  export type IntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _avg?: NestedFloatNullableFilter<$PrismaModel>;
    _sum?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedIntNullableFilter<$PrismaModel>;
    _max?: NestedIntNullableFilter<$PrismaModel>;
  };

  export type FloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _avg?: NestedFloatNullableFilter<$PrismaModel>;
    _sum?: NestedFloatNullableFilter<$PrismaModel>;
    _min?: NestedFloatNullableFilter<$PrismaModel>;
    _max?: NestedFloatNullableFilter<$PrismaModel>;
  };
  export type JsonWithAggregatesFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<
          Required<JsonWithAggregatesFilterBase<$PrismaModel>>,
          Exclude<keyof Required<JsonWithAggregatesFilterBase<$PrismaModel>>, "path">
        >,
        Required<JsonWithAggregatesFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<JsonWithAggregatesFilterBase<$PrismaModel>>, "path">>;

  export type JsonWithAggregatesFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter;
    path?: string[];
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>;
    string_contains?: string | StringFieldRefInput<$PrismaModel>;
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>;
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>;
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedJsonFilter<$PrismaModel>;
    _max?: NestedJsonFilter<$PrismaModel>;
  };

  export type DateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedDateTimeNullableFilter<$PrismaModel>;
    _max?: NestedDateTimeNullableFilter<$PrismaModel>;
  };

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedDateTimeFilter<$PrismaModel>;
    _max?: NestedDateTimeFilter<$PrismaModel>;
  };

  export type BoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null;
  };

  export type SessionScalarRelationFilter = {
    is?: SessionWhereInput;
    isNot?: SessionWhereInput;
  };

  export type SessionEventCountOrderByAggregateInput = {
    id?: SortOrder;
    sessionId?: SortOrder;
    type?: SortOrder;
    data?: SortOrder;
    createdAt?: SortOrder;
    turnIndex?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    thinkingTokens?: SortOrder;
    costUsd?: SortOrder;
    modelId?: SortOrder;
    toolName?: SortOrder;
    toolUseId?: SortOrder;
    toolLatencyMs?: SortOrder;
    toolIsError?: SortOrder;
  };

  export type SessionEventAvgOrderByAggregateInput = {
    turnIndex?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    thinkingTokens?: SortOrder;
    costUsd?: SortOrder;
    toolLatencyMs?: SortOrder;
  };

  export type SessionEventMaxOrderByAggregateInput = {
    id?: SortOrder;
    sessionId?: SortOrder;
    type?: SortOrder;
    createdAt?: SortOrder;
    turnIndex?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    thinkingTokens?: SortOrder;
    costUsd?: SortOrder;
    modelId?: SortOrder;
    toolName?: SortOrder;
    toolUseId?: SortOrder;
    toolLatencyMs?: SortOrder;
    toolIsError?: SortOrder;
  };

  export type SessionEventMinOrderByAggregateInput = {
    id?: SortOrder;
    sessionId?: SortOrder;
    type?: SortOrder;
    createdAt?: SortOrder;
    turnIndex?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    thinkingTokens?: SortOrder;
    costUsd?: SortOrder;
    modelId?: SortOrder;
    toolName?: SortOrder;
    toolUseId?: SortOrder;
    toolLatencyMs?: SortOrder;
    toolIsError?: SortOrder;
  };

  export type SessionEventSumOrderByAggregateInput = {
    turnIndex?: SortOrder;
    inputTokens?: SortOrder;
    outputTokens?: SortOrder;
    thinkingTokens?: SortOrder;
    costUsd?: SortOrder;
    toolLatencyMs?: SortOrder;
  };

  export type BoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedBoolNullableFilter<$PrismaModel>;
    _max?: NestedBoolNullableFilter<$PrismaModel>;
  };

  export type StoredSpecCountOrderByAggregateInput = {
    id?: SortOrder;
    userId?: SortOrder;
    prompt?: SortOrder;
    spec?: SortOrder;
    rawLines?: SortOrder;
    isFavorite?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type StoredSpecMaxOrderByAggregateInput = {
    id?: SortOrder;
    userId?: SortOrder;
    prompt?: SortOrder;
    isFavorite?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type StoredSpecMinOrderByAggregateInput = {
    id?: SortOrder;
    userId?: SortOrder;
    prompt?: SortOrder;
    isFavorite?: SortOrder;
    createdAt?: SortOrder;
    updatedAt?: SortOrder;
  };

  export type SessionCreateNestedOneWithoutChildrenInput = {
    create?: XOR<SessionCreateWithoutChildrenInput, SessionUncheckedCreateWithoutChildrenInput>;
    connectOrCreate?: SessionCreateOrConnectWithoutChildrenInput;
    connect?: SessionWhereUniqueInput;
  };

  export type SessionCreateNestedManyWithoutParentInput = {
    create?:
      | XOR<SessionCreateWithoutParentInput, SessionUncheckedCreateWithoutParentInput>
      | SessionCreateWithoutParentInput[]
      | SessionUncheckedCreateWithoutParentInput[];
    connectOrCreate?:
      | SessionCreateOrConnectWithoutParentInput
      | SessionCreateOrConnectWithoutParentInput[];
    createMany?: SessionCreateManyParentInputEnvelope;
    connect?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
  };

  export type SessionEventCreateNestedManyWithoutSessionInput = {
    create?:
      | XOR<SessionEventCreateWithoutSessionInput, SessionEventUncheckedCreateWithoutSessionInput>
      | SessionEventCreateWithoutSessionInput[]
      | SessionEventUncheckedCreateWithoutSessionInput[];
    connectOrCreate?:
      | SessionEventCreateOrConnectWithoutSessionInput
      | SessionEventCreateOrConnectWithoutSessionInput[];
    createMany?: SessionEventCreateManySessionInputEnvelope;
    connect?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
  };

  export type SessionUncheckedCreateNestedManyWithoutParentInput = {
    create?:
      | XOR<SessionCreateWithoutParentInput, SessionUncheckedCreateWithoutParentInput>
      | SessionCreateWithoutParentInput[]
      | SessionUncheckedCreateWithoutParentInput[];
    connectOrCreate?:
      | SessionCreateOrConnectWithoutParentInput
      | SessionCreateOrConnectWithoutParentInput[];
    createMany?: SessionCreateManyParentInputEnvelope;
    connect?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
  };

  export type SessionEventUncheckedCreateNestedManyWithoutSessionInput = {
    create?:
      | XOR<SessionEventCreateWithoutSessionInput, SessionEventUncheckedCreateWithoutSessionInput>
      | SessionEventCreateWithoutSessionInput[]
      | SessionEventUncheckedCreateWithoutSessionInput[];
    connectOrCreate?:
      | SessionEventCreateOrConnectWithoutSessionInput
      | SessionEventCreateOrConnectWithoutSessionInput[];
    createMany?: SessionEventCreateManySessionInputEnvelope;
    connect?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
  };

  export type StringFieldUpdateOperationsInput = {
    set?: string;
  };

  export type EnumSessionStatusFieldUpdateOperationsInput = {
    set?: $Enums.SessionStatus;
  };

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null;
  };

  export type IntFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
  };

  export type FloatFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
  };

  export type BoolFieldUpdateOperationsInput = {
    set?: boolean;
  };

  export type NullableIntFieldUpdateOperationsInput = {
    set?: number | null;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
  };

  export type NullableFloatFieldUpdateOperationsInput = {
    set?: number | null;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
  };

  export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null;
  };

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string;
  };

  export type SessionUpdateOneWithoutChildrenNestedInput = {
    create?: XOR<SessionCreateWithoutChildrenInput, SessionUncheckedCreateWithoutChildrenInput>;
    connectOrCreate?: SessionCreateOrConnectWithoutChildrenInput;
    upsert?: SessionUpsertWithoutChildrenInput;
    disconnect?: SessionWhereInput | boolean;
    delete?: SessionWhereInput | boolean;
    connect?: SessionWhereUniqueInput;
    update?: XOR<
      XOR<SessionUpdateToOneWithWhereWithoutChildrenInput, SessionUpdateWithoutChildrenInput>,
      SessionUncheckedUpdateWithoutChildrenInput
    >;
  };

  export type SessionUpdateManyWithoutParentNestedInput = {
    create?:
      | XOR<SessionCreateWithoutParentInput, SessionUncheckedCreateWithoutParentInput>
      | SessionCreateWithoutParentInput[]
      | SessionUncheckedCreateWithoutParentInput[];
    connectOrCreate?:
      | SessionCreateOrConnectWithoutParentInput
      | SessionCreateOrConnectWithoutParentInput[];
    upsert?:
      | SessionUpsertWithWhereUniqueWithoutParentInput
      | SessionUpsertWithWhereUniqueWithoutParentInput[];
    createMany?: SessionCreateManyParentInputEnvelope;
    set?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    disconnect?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    delete?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    connect?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    update?:
      | SessionUpdateWithWhereUniqueWithoutParentInput
      | SessionUpdateWithWhereUniqueWithoutParentInput[];
    updateMany?:
      | SessionUpdateManyWithWhereWithoutParentInput
      | SessionUpdateManyWithWhereWithoutParentInput[];
    deleteMany?: SessionScalarWhereInput | SessionScalarWhereInput[];
  };

  export type SessionEventUpdateManyWithoutSessionNestedInput = {
    create?:
      | XOR<SessionEventCreateWithoutSessionInput, SessionEventUncheckedCreateWithoutSessionInput>
      | SessionEventCreateWithoutSessionInput[]
      | SessionEventUncheckedCreateWithoutSessionInput[];
    connectOrCreate?:
      | SessionEventCreateOrConnectWithoutSessionInput
      | SessionEventCreateOrConnectWithoutSessionInput[];
    upsert?:
      | SessionEventUpsertWithWhereUniqueWithoutSessionInput
      | SessionEventUpsertWithWhereUniqueWithoutSessionInput[];
    createMany?: SessionEventCreateManySessionInputEnvelope;
    set?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    disconnect?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    delete?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    connect?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    update?:
      | SessionEventUpdateWithWhereUniqueWithoutSessionInput
      | SessionEventUpdateWithWhereUniqueWithoutSessionInput[];
    updateMany?:
      | SessionEventUpdateManyWithWhereWithoutSessionInput
      | SessionEventUpdateManyWithWhereWithoutSessionInput[];
    deleteMany?: SessionEventScalarWhereInput | SessionEventScalarWhereInput[];
  };

  export type SessionUncheckedUpdateManyWithoutParentNestedInput = {
    create?:
      | XOR<SessionCreateWithoutParentInput, SessionUncheckedCreateWithoutParentInput>
      | SessionCreateWithoutParentInput[]
      | SessionUncheckedCreateWithoutParentInput[];
    connectOrCreate?:
      | SessionCreateOrConnectWithoutParentInput
      | SessionCreateOrConnectWithoutParentInput[];
    upsert?:
      | SessionUpsertWithWhereUniqueWithoutParentInput
      | SessionUpsertWithWhereUniqueWithoutParentInput[];
    createMany?: SessionCreateManyParentInputEnvelope;
    set?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    disconnect?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    delete?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    connect?: SessionWhereUniqueInput | SessionWhereUniqueInput[];
    update?:
      | SessionUpdateWithWhereUniqueWithoutParentInput
      | SessionUpdateWithWhereUniqueWithoutParentInput[];
    updateMany?:
      | SessionUpdateManyWithWhereWithoutParentInput
      | SessionUpdateManyWithWhereWithoutParentInput[];
    deleteMany?: SessionScalarWhereInput | SessionScalarWhereInput[];
  };

  export type SessionEventUncheckedUpdateManyWithoutSessionNestedInput = {
    create?:
      | XOR<SessionEventCreateWithoutSessionInput, SessionEventUncheckedCreateWithoutSessionInput>
      | SessionEventCreateWithoutSessionInput[]
      | SessionEventUncheckedCreateWithoutSessionInput[];
    connectOrCreate?:
      | SessionEventCreateOrConnectWithoutSessionInput
      | SessionEventCreateOrConnectWithoutSessionInput[];
    upsert?:
      | SessionEventUpsertWithWhereUniqueWithoutSessionInput
      | SessionEventUpsertWithWhereUniqueWithoutSessionInput[];
    createMany?: SessionEventCreateManySessionInputEnvelope;
    set?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    disconnect?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    delete?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    connect?: SessionEventWhereUniqueInput | SessionEventWhereUniqueInput[];
    update?:
      | SessionEventUpdateWithWhereUniqueWithoutSessionInput
      | SessionEventUpdateWithWhereUniqueWithoutSessionInput[];
    updateMany?:
      | SessionEventUpdateManyWithWhereWithoutSessionInput
      | SessionEventUpdateManyWithWhereWithoutSessionInput[];
    deleteMany?: SessionEventScalarWhereInput | SessionEventScalarWhereInput[];
  };

  export type SessionCreateNestedOneWithoutEventsInput = {
    create?: XOR<SessionCreateWithoutEventsInput, SessionUncheckedCreateWithoutEventsInput>;
    connectOrCreate?: SessionCreateOrConnectWithoutEventsInput;
    connect?: SessionWhereUniqueInput;
  };

  export type NullableBoolFieldUpdateOperationsInput = {
    set?: boolean | null;
  };

  export type SessionUpdateOneRequiredWithoutEventsNestedInput = {
    create?: XOR<SessionCreateWithoutEventsInput, SessionUncheckedCreateWithoutEventsInput>;
    connectOrCreate?: SessionCreateOrConnectWithoutEventsInput;
    upsert?: SessionUpsertWithoutEventsInput;
    connect?: SessionWhereUniqueInput;
    update?: XOR<
      XOR<SessionUpdateToOneWithWhereWithoutEventsInput, SessionUpdateWithoutEventsInput>,
      SessionUncheckedUpdateWithoutEventsInput
    >;
  };

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringFilter<$PrismaModel> | string;
  };

  export type NestedEnumSessionStatusFilter<$PrismaModel = never> = {
    equals?: $Enums.SessionStatus | EnumSessionStatusFieldRefInput<$PrismaModel>;
    in?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    notIn?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    not?: NestedEnumSessionStatusFilter<$PrismaModel> | $Enums.SessionStatus;
  };

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringNullableFilter<$PrismaModel> | string | null;
  };

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntFilter<$PrismaModel> | number;
  };

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatFilter<$PrismaModel> | number;
  };

  export type NestedBoolFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>;
    not?: NestedBoolFilter<$PrismaModel> | boolean;
  };

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntNullableFilter<$PrismaModel> | number | null;
  };

  export type NestedFloatNullableFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatNullableFilter<$PrismaModel> | number | null;
  };

  export type NestedDateTimeNullableFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeNullableFilter<$PrismaModel> | Date | string | null;
  };

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string;
  };

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>;
    in?: string[] | ListStringFieldRefInput<$PrismaModel>;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedStringFilter<$PrismaModel>;
    _max?: NestedStringFilter<$PrismaModel>;
  };

  export type NestedEnumSessionStatusWithAggregatesFilter<$PrismaModel = never> = {
    equals?: $Enums.SessionStatus | EnumSessionStatusFieldRefInput<$PrismaModel>;
    in?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    notIn?: $Enums.SessionStatus[] | ListEnumSessionStatusFieldRefInput<$PrismaModel>;
    not?: NestedEnumSessionStatusWithAggregatesFilter<$PrismaModel> | $Enums.SessionStatus;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedEnumSessionStatusFilter<$PrismaModel>;
    _max?: NestedEnumSessionStatusFilter<$PrismaModel>;
  };

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null;
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null;
    lt?: string | StringFieldRefInput<$PrismaModel>;
    lte?: string | StringFieldRefInput<$PrismaModel>;
    gt?: string | StringFieldRefInput<$PrismaModel>;
    gte?: string | StringFieldRefInput<$PrismaModel>;
    contains?: string | StringFieldRefInput<$PrismaModel>;
    startsWith?: string | StringFieldRefInput<$PrismaModel>;
    endsWith?: string | StringFieldRefInput<$PrismaModel>;
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedStringNullableFilter<$PrismaModel>;
    _max?: NestedStringNullableFilter<$PrismaModel>;
  };

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>;
    in?: number[] | ListIntFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number;
    _count?: NestedIntFilter<$PrismaModel>;
    _avg?: NestedFloatFilter<$PrismaModel>;
    _sum?: NestedIntFilter<$PrismaModel>;
    _min?: NestedIntFilter<$PrismaModel>;
    _max?: NestedIntFilter<$PrismaModel>;
  };

  export type NestedFloatWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatWithAggregatesFilter<$PrismaModel> | number;
    _count?: NestedIntFilter<$PrismaModel>;
    _avg?: NestedFloatFilter<$PrismaModel>;
    _sum?: NestedFloatFilter<$PrismaModel>;
    _min?: NestedFloatFilter<$PrismaModel>;
    _max?: NestedFloatFilter<$PrismaModel>;
  };

  export type NestedBoolWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel>;
    not?: NestedBoolWithAggregatesFilter<$PrismaModel> | boolean;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedBoolFilter<$PrismaModel>;
    _max?: NestedBoolFilter<$PrismaModel>;
  };

  export type NestedIntNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null;
    lt?: number | IntFieldRefInput<$PrismaModel>;
    lte?: number | IntFieldRefInput<$PrismaModel>;
    gt?: number | IntFieldRefInput<$PrismaModel>;
    gte?: number | IntFieldRefInput<$PrismaModel>;
    not?: NestedIntNullableWithAggregatesFilter<$PrismaModel> | number | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _avg?: NestedFloatNullableFilter<$PrismaModel>;
    _sum?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedIntNullableFilter<$PrismaModel>;
    _max?: NestedIntNullableFilter<$PrismaModel>;
  };

  export type NestedFloatNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel> | null;
    in?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel> | null;
    lt?: number | FloatFieldRefInput<$PrismaModel>;
    lte?: number | FloatFieldRefInput<$PrismaModel>;
    gt?: number | FloatFieldRefInput<$PrismaModel>;
    gte?: number | FloatFieldRefInput<$PrismaModel>;
    not?: NestedFloatNullableWithAggregatesFilter<$PrismaModel> | number | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _avg?: NestedFloatNullableFilter<$PrismaModel>;
    _sum?: NestedFloatNullableFilter<$PrismaModel>;
    _min?: NestedFloatNullableFilter<$PrismaModel>;
    _max?: NestedFloatNullableFilter<$PrismaModel>;
  };
  export type NestedJsonFilter<$PrismaModel = never> =
    | PatchUndefined<
        Either<
          Required<NestedJsonFilterBase<$PrismaModel>>,
          Exclude<keyof Required<NestedJsonFilterBase<$PrismaModel>>, "path">
        >,
        Required<NestedJsonFilterBase<$PrismaModel>>
      >
    | OptionalFlat<Omit<Required<NestedJsonFilterBase<$PrismaModel>>, "path">>;

  export type NestedJsonFilterBase<$PrismaModel = never> = {
    equals?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter;
    path?: string[];
    mode?: QueryMode | EnumQueryModeFieldRefInput<$PrismaModel>;
    string_contains?: string | StringFieldRefInput<$PrismaModel>;
    string_starts_with?: string | StringFieldRefInput<$PrismaModel>;
    string_ends_with?: string | StringFieldRefInput<$PrismaModel>;
    array_starts_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_ends_with?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    array_contains?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | null;
    lt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    lte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gt?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    gte?: InputJsonValue | JsonFieldRefInput<$PrismaModel>;
    not?: InputJsonValue | JsonFieldRefInput<$PrismaModel> | JsonNullValueFilter;
  };

  export type NestedDateTimeNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel> | null;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel> | null;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeNullableWithAggregatesFilter<$PrismaModel> | Date | string | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedDateTimeNullableFilter<$PrismaModel>;
    _max?: NestedDateTimeNullableFilter<$PrismaModel>;
  };

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>;
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>;
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string;
    _count?: NestedIntFilter<$PrismaModel>;
    _min?: NestedDateTimeFilter<$PrismaModel>;
    _max?: NestedDateTimeFilter<$PrismaModel>;
  };

  export type NestedBoolNullableFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableFilter<$PrismaModel> | boolean | null;
  };

  export type NestedBoolNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: boolean | BooleanFieldRefInput<$PrismaModel> | null;
    not?: NestedBoolNullableWithAggregatesFilter<$PrismaModel> | boolean | null;
    _count?: NestedIntNullableFilter<$PrismaModel>;
    _min?: NestedBoolNullableFilter<$PrismaModel>;
    _max?: NestedBoolNullableFilter<$PrismaModel>;
  };

  export type SessionCreateWithoutChildrenInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parent?: SessionCreateNestedOneWithoutChildrenInput;
    events?: SessionEventCreateNestedManyWithoutSessionInput;
  };

  export type SessionUncheckedCreateWithoutChildrenInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parentId?: string | null;
    events?: SessionEventUncheckedCreateNestedManyWithoutSessionInput;
  };

  export type SessionCreateOrConnectWithoutChildrenInput = {
    where: SessionWhereUniqueInput;
    create: XOR<SessionCreateWithoutChildrenInput, SessionUncheckedCreateWithoutChildrenInput>;
  };

  export type SessionCreateWithoutParentInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    children?: SessionCreateNestedManyWithoutParentInput;
    events?: SessionEventCreateNestedManyWithoutSessionInput;
  };

  export type SessionUncheckedCreateWithoutParentInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    children?: SessionUncheckedCreateNestedManyWithoutParentInput;
    events?: SessionEventUncheckedCreateNestedManyWithoutSessionInput;
  };

  export type SessionCreateOrConnectWithoutParentInput = {
    where: SessionWhereUniqueInput;
    create: XOR<SessionCreateWithoutParentInput, SessionUncheckedCreateWithoutParentInput>;
  };

  export type SessionCreateManyParentInputEnvelope = {
    data: SessionCreateManyParentInput | SessionCreateManyParentInput[];
    skipDuplicates?: boolean;
  };

  export type SessionEventCreateWithoutSessionInput = {
    id?: string;
    type: string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: Date | string;
    turnIndex?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    thinkingTokens?: number | null;
    costUsd?: number | null;
    modelId?: string | null;
    toolName?: string | null;
    toolUseId?: string | null;
    toolLatencyMs?: number | null;
    toolIsError?: boolean | null;
  };

  export type SessionEventUncheckedCreateWithoutSessionInput = {
    id?: string;
    type: string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: Date | string;
    turnIndex?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    thinkingTokens?: number | null;
    costUsd?: number | null;
    modelId?: string | null;
    toolName?: string | null;
    toolUseId?: string | null;
    toolLatencyMs?: number | null;
    toolIsError?: boolean | null;
  };

  export type SessionEventCreateOrConnectWithoutSessionInput = {
    where: SessionEventWhereUniqueInput;
    create: XOR<
      SessionEventCreateWithoutSessionInput,
      SessionEventUncheckedCreateWithoutSessionInput
    >;
  };

  export type SessionEventCreateManySessionInputEnvelope = {
    data: SessionEventCreateManySessionInput | SessionEventCreateManySessionInput[];
    skipDuplicates?: boolean;
  };

  export type SessionUpsertWithoutChildrenInput = {
    update: XOR<SessionUpdateWithoutChildrenInput, SessionUncheckedUpdateWithoutChildrenInput>;
    create: XOR<SessionCreateWithoutChildrenInput, SessionUncheckedCreateWithoutChildrenInput>;
    where?: SessionWhereInput;
  };

  export type SessionUpdateToOneWithWhereWithoutChildrenInput = {
    where?: SessionWhereInput;
    data: XOR<SessionUpdateWithoutChildrenInput, SessionUncheckedUpdateWithoutChildrenInput>;
  };

  export type SessionUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parent?: SessionUpdateOneWithoutChildrenNestedInput;
    events?: SessionEventUpdateManyWithoutSessionNestedInput;
  };

  export type SessionUncheckedUpdateWithoutChildrenInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parentId?: NullableStringFieldUpdateOperationsInput | string | null;
    events?: SessionEventUncheckedUpdateManyWithoutSessionNestedInput;
  };

  export type SessionUpsertWithWhereUniqueWithoutParentInput = {
    where: SessionWhereUniqueInput;
    update: XOR<SessionUpdateWithoutParentInput, SessionUncheckedUpdateWithoutParentInput>;
    create: XOR<SessionCreateWithoutParentInput, SessionUncheckedCreateWithoutParentInput>;
  };

  export type SessionUpdateWithWhereUniqueWithoutParentInput = {
    where: SessionWhereUniqueInput;
    data: XOR<SessionUpdateWithoutParentInput, SessionUncheckedUpdateWithoutParentInput>;
  };

  export type SessionUpdateManyWithWhereWithoutParentInput = {
    where: SessionScalarWhereInput;
    data: XOR<SessionUpdateManyMutationInput, SessionUncheckedUpdateManyWithoutParentInput>;
  };

  export type SessionScalarWhereInput = {
    AND?: SessionScalarWhereInput | SessionScalarWhereInput[];
    OR?: SessionScalarWhereInput[];
    NOT?: SessionScalarWhereInput | SessionScalarWhereInput[];
    id?: StringFilter<"Session"> | string;
    status?: EnumSessionStatusFilter<"Session"> | $Enums.SessionStatus;
    taskDescription?: StringFilter<"Session"> | string;
    userId?: StringNullableFilter<"Session"> | string | null;
    branchName?: StringNullableFilter<"Session"> | string | null;
    baseBranch?: StringFilter<"Session"> | string;
    model?: StringFilter<"Session"> | string;
    maxTurns?: IntFilter<"Session"> | number;
    maxBudgetUsd?: FloatFilter<"Session"> | number;
    createPr?: BoolFilter<"Session"> | boolean;
    prUrl?: StringNullableFilter<"Session"> | string | null;
    prNumber?: IntNullableFilter<"Session"> | number | null;
    resultText?: StringNullableFilter<"Session"> | string | null;
    costUsd?: FloatNullableFilter<"Session"> | number | null;
    inputTokens?: IntNullableFilter<"Session"> | number | null;
    outputTokens?: IntNullableFilter<"Session"> | number | null;
    numTurns?: IntNullableFilter<"Session"> | number | null;
    durationMs?: IntNullableFilter<"Session"> | number | null;
    errors?: JsonFilter<"Session">;
    failureCategory?: StringNullableFilter<"Session"> | string | null;
    sdkSessionId?: StringNullableFilter<"Session"> | string | null;
    startedAt?: DateTimeNullableFilter<"Session"> | Date | string | null;
    completedAt?: DateTimeNullableFilter<"Session"> | Date | string | null;
    createdAt?: DateTimeFilter<"Session"> | Date | string;
    updatedAt?: DateTimeFilter<"Session"> | Date | string;
    parentId?: StringNullableFilter<"Session"> | string | null;
  };

  export type SessionEventUpsertWithWhereUniqueWithoutSessionInput = {
    where: SessionEventWhereUniqueInput;
    update: XOR<
      SessionEventUpdateWithoutSessionInput,
      SessionEventUncheckedUpdateWithoutSessionInput
    >;
    create: XOR<
      SessionEventCreateWithoutSessionInput,
      SessionEventUncheckedCreateWithoutSessionInput
    >;
  };

  export type SessionEventUpdateWithWhereUniqueWithoutSessionInput = {
    where: SessionEventWhereUniqueInput;
    data: XOR<
      SessionEventUpdateWithoutSessionInput,
      SessionEventUncheckedUpdateWithoutSessionInput
    >;
  };

  export type SessionEventUpdateManyWithWhereWithoutSessionInput = {
    where: SessionEventScalarWhereInput;
    data: XOR<
      SessionEventUpdateManyMutationInput,
      SessionEventUncheckedUpdateManyWithoutSessionInput
    >;
  };

  export type SessionEventScalarWhereInput = {
    AND?: SessionEventScalarWhereInput | SessionEventScalarWhereInput[];
    OR?: SessionEventScalarWhereInput[];
    NOT?: SessionEventScalarWhereInput | SessionEventScalarWhereInput[];
    id?: StringFilter<"SessionEvent"> | string;
    sessionId?: StringFilter<"SessionEvent"> | string;
    type?: StringFilter<"SessionEvent"> | string;
    data?: JsonFilter<"SessionEvent">;
    createdAt?: DateTimeFilter<"SessionEvent"> | Date | string;
    turnIndex?: IntNullableFilter<"SessionEvent"> | number | null;
    inputTokens?: IntNullableFilter<"SessionEvent"> | number | null;
    outputTokens?: IntNullableFilter<"SessionEvent"> | number | null;
    thinkingTokens?: IntNullableFilter<"SessionEvent"> | number | null;
    costUsd?: FloatNullableFilter<"SessionEvent"> | number | null;
    modelId?: StringNullableFilter<"SessionEvent"> | string | null;
    toolName?: StringNullableFilter<"SessionEvent"> | string | null;
    toolUseId?: StringNullableFilter<"SessionEvent"> | string | null;
    toolLatencyMs?: IntNullableFilter<"SessionEvent"> | number | null;
    toolIsError?: BoolNullableFilter<"SessionEvent"> | boolean | null;
  };

  export type SessionCreateWithoutEventsInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parent?: SessionCreateNestedOneWithoutChildrenInput;
    children?: SessionCreateNestedManyWithoutParentInput;
  };

  export type SessionUncheckedCreateWithoutEventsInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    parentId?: string | null;
    children?: SessionUncheckedCreateNestedManyWithoutParentInput;
  };

  export type SessionCreateOrConnectWithoutEventsInput = {
    where: SessionWhereUniqueInput;
    create: XOR<SessionCreateWithoutEventsInput, SessionUncheckedCreateWithoutEventsInput>;
  };

  export type SessionUpsertWithoutEventsInput = {
    update: XOR<SessionUpdateWithoutEventsInput, SessionUncheckedUpdateWithoutEventsInput>;
    create: XOR<SessionCreateWithoutEventsInput, SessionUncheckedCreateWithoutEventsInput>;
    where?: SessionWhereInput;
  };

  export type SessionUpdateToOneWithWhereWithoutEventsInput = {
    where?: SessionWhereInput;
    data: XOR<SessionUpdateWithoutEventsInput, SessionUncheckedUpdateWithoutEventsInput>;
  };

  export type SessionUpdateWithoutEventsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parent?: SessionUpdateOneWithoutChildrenNestedInput;
    children?: SessionUpdateManyWithoutParentNestedInput;
  };

  export type SessionUncheckedUpdateWithoutEventsInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    parentId?: NullableStringFieldUpdateOperationsInput | string | null;
    children?: SessionUncheckedUpdateManyWithoutParentNestedInput;
  };

  export type SessionCreateManyParentInput = {
    id?: string;
    status?: $Enums.SessionStatus;
    taskDescription: string;
    userId?: string | null;
    branchName?: string | null;
    baseBranch?: string;
    model?: string;
    maxTurns?: number;
    maxBudgetUsd?: number;
    createPr?: boolean;
    prUrl?: string | null;
    prNumber?: number | null;
    resultText?: string | null;
    costUsd?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    numTurns?: number | null;
    durationMs?: number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: string | null;
    sdkSessionId?: string | null;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };

  export type SessionEventCreateManySessionInput = {
    id?: string;
    type: string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: Date | string;
    turnIndex?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    thinkingTokens?: number | null;
    costUsd?: number | null;
    modelId?: string | null;
    toolName?: string | null;
    toolUseId?: string | null;
    toolLatencyMs?: number | null;
    toolIsError?: boolean | null;
  };

  export type SessionUpdateWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    children?: SessionUpdateManyWithoutParentNestedInput;
    events?: SessionEventUpdateManyWithoutSessionNestedInput;
  };

  export type SessionUncheckedUpdateWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    children?: SessionUncheckedUpdateManyWithoutParentNestedInput;
    events?: SessionEventUncheckedUpdateManyWithoutSessionNestedInput;
  };

  export type SessionUncheckedUpdateManyWithoutParentInput = {
    id?: StringFieldUpdateOperationsInput | string;
    status?: EnumSessionStatusFieldUpdateOperationsInput | $Enums.SessionStatus;
    taskDescription?: StringFieldUpdateOperationsInput | string;
    userId?: NullableStringFieldUpdateOperationsInput | string | null;
    branchName?: NullableStringFieldUpdateOperationsInput | string | null;
    baseBranch?: StringFieldUpdateOperationsInput | string;
    model?: StringFieldUpdateOperationsInput | string;
    maxTurns?: IntFieldUpdateOperationsInput | number;
    maxBudgetUsd?: FloatFieldUpdateOperationsInput | number;
    createPr?: BoolFieldUpdateOperationsInput | boolean;
    prUrl?: NullableStringFieldUpdateOperationsInput | string | null;
    prNumber?: NullableIntFieldUpdateOperationsInput | number | null;
    resultText?: NullableStringFieldUpdateOperationsInput | string | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    numTurns?: NullableIntFieldUpdateOperationsInput | number | null;
    durationMs?: NullableIntFieldUpdateOperationsInput | number | null;
    errors?: JsonNullValueInput | InputJsonValue;
    failureCategory?: NullableStringFieldUpdateOperationsInput | string | null;
    sdkSessionId?: NullableStringFieldUpdateOperationsInput | string | null;
    startedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    completedAt?: NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string;
  };

  export type SessionEventUpdateWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
  };

  export type SessionEventUncheckedUpdateWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
  };

  export type SessionEventUncheckedUpdateManyWithoutSessionInput = {
    id?: StringFieldUpdateOperationsInput | string;
    type?: StringFieldUpdateOperationsInput | string;
    data?: JsonNullValueInput | InputJsonValue;
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string;
    turnIndex?: NullableIntFieldUpdateOperationsInput | number | null;
    inputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    outputTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    thinkingTokens?: NullableIntFieldUpdateOperationsInput | number | null;
    costUsd?: NullableFloatFieldUpdateOperationsInput | number | null;
    modelId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolName?: NullableStringFieldUpdateOperationsInput | string | null;
    toolUseId?: NullableStringFieldUpdateOperationsInput | string | null;
    toolLatencyMs?: NullableIntFieldUpdateOperationsInput | number | null;
    toolIsError?: NullableBoolFieldUpdateOperationsInput | boolean | null;
  };

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number;
  };

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF;
}
