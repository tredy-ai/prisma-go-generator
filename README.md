# prisma-go-generator

A [Prisma](https://www.prisma.io/) generator that writes Go from your Prisma schema: a struct per model, a type per enum, and, if you ask for them, Prisma's query input types (`UserWhereInput`, `UserUncheckedCreateInput` and the rest).

The output is plain data. It has no runtime and no query engine, so it works with whichever database library you already use.

```prisma
generator go {
  provider = "prisma-go-generator"
  output   = "../models"
}
```

```go
// User - A person who can sign in.
type User struct {
	Id        int32     `json:"id,omitempty" db:"id"` // primary key
	Email     string    `json:"email" db:"email"`
	Name      *string   `json:"name,omitempty" db:"name"`
	Role      Role      `json:"role,omitempty" db:"role"`
	CreatedAt time.Time `json:"createdAt,omitempty" db:"created_at"`

	// Relations (not persisted, populate manually)
	Posts []Post `json:"posts,omitempty" db:"-"`
}
```

With no options set, the output is what [prisma2go](https://github.com/tredy-ai/prisma2go) writes. Every decision prisma2go made for you is an option here.

## Status

Version 0.1.0, not yet published to a package registry. Tested against Prisma 7.10 and Go 1.27.

## Requirements

- Node.js 20.19 or later and Prisma 7.
- `gofmt` on your `PATH` when `prisma generate` runs. The generator formats its output with it, so the files never change when you run `gofmt` yourself. Set `gofmt = "false"` to do without.
- [enumer](https://github.com/dmarkham/enumer) on your `PATH` if you want `String`, JSON and SQL methods on integer enums. Without it the generator prints a warning and carries on.
- Go 1.18 or later to compile the query inputs, which use generics.

## Install

```bash
pnpm add -D prisma @tredy-ai/prisma-go-generator
go install github.com/dmarkham/enumer@latest   # optional
```

Add the generator block shown above to your schema, then run `pnpm prisma generate`.

Prisma runs every generator block on each `prisma generate`. To run only some of them, name them: `prisma generate --generator client`.

## Options

Every option is a string, or a list of strings, in the generator block. `output` is Prisma's own option and is resolved relative to the schema file that declares the generator.

| Option | Default | What it does |
|---|---|---|
| `output` | `./models` | Directory the Go files are written to. |
| `package` | name of the output directory | Go package name. |
| `emitSingle` | `"true"` | Write everything to one file, named by `fileName`. |
| `emitPerFile` | `"false"` | Write one Go file per `.prisma` file. |
| `emitPerModel` | `"false"` | Write one Go file per model, holding the struct and its inputs. Enums go to `enums.go`. |
| `fileName` | `models.go` | File name for the single layout. |
| `structTags` | `["json", "db"]` | Struct tags to write, in order. See [Struct tags](#struct-tags). |
| `omitempty` | `["json"]` | Tags that get `,omitempty` on optional and defaulted columns. |
| `types` | `[]` | Go type overrides. See [Type mapping](#type-mapping). |
| `optionalType` | `pointer` | How an optional column is typed: `*T`, or a generic wrapper such as `database/sql.Null`. |
| `enumType` | `int` | Go type behind enums: any integer type (`int`, `uint8`, ...) or `string`. |
| `enumer` | `"true"` for integer enums | Run enumer for every enum after generating. |
| `enumerArgs` | `["-json", "-sql", "-text", "-trimprefix={name}"]` | Arguments passed to enumer after `-type={name}`. |
| `enumDirective` | `enumer -type={name}` plus `enumerArgs` | The `//go:generate` line above each enum. Empty for none. |
| `initialisms` | `[]` | Words to write in capitals in Go names, such as `["ID", "URL"]`. |
| `relations` | `"true"` | Include relation fields in model structs and inputs. |
| `tableNameMethod` | `"false"` | Add `func (User) TableName() string` to every model. |
| `inputs` | `[]` | Query input families to generate. See [Query inputs](#query-inputs). |
| `gofmt` | `"true"` | Format the output with `gofmt`. |
| `generateGoMod` | `"false"` | Write a `go.mod` into the output directory if there is none. |
| `goModule` | | Module path for the generated `go.mod`. Required with `generateGoMod`. |
| `goVersion` | version of the installed Go | `go` directive for the generated `go.mod`. |
| `runGoGenerate` | `"false"` | Run `go generate` in the output directory as the last step. |

Only one of the three `emit*` options can be `"true"`. An option name the generator does not know is an error, so a typo cannot be silently ignored.

Prisma passes `env("NAME")` in a custom option through as the bare name `NAME`, so use literal values here.

## Type mapping

| Prisma | Go |
|---|---|
| `String` | `string` |
| `Int` | `int32` |
| `BigInt` | `int64` |
| `Float` | `float64` |
| `Boolean` | `bool` |
| `DateTime` | `time.Time` |
| `Json` | `json.RawMessage` |
| `Bytes` | `[]byte` |
| `Decimal` | `string` |
| `@db.Uuid` | `uuid.UUID` from `github.com/google/uuid` |
| `@db.Real` | `float32` |
| an enum | the generated enum type |
| `T?` | `*T` |
| `T[]` | `[]T` |
| a to-one relation | `*Model` |
| a to-many relation | `[]Model` |

A type Prisma adds later, or one this table does not know, becomes `json.RawMessage`.

### Overriding a type

`types` takes entries of the form `Prisma=Go`. The left side is a Prisma scalar (`Int`) or a native type written as in the schema (`db.Uuid`). The right side is a Go type: a builtin as is, anything else as its import path, a dot, and the type name.

```prisma
generator go {
  provider = "prisma-go-generator"
  output   = "../models"
  types    = [
    "Int=int",
    "Json=map[string]any",
    "Decimal=github.com/shopspring/decimal.Decimal",
    "db.Uuid=uuid.UUID",                // the standard library package, Go 1.27 and later
    "db.Timestamptz=github.com/jackc/pgx/v5/pgtype.Timestamptz",
  ]
}
```

The generator works out the import and the package name from the path: `github.com/gofrs/uuid/v5.UUID` is written as `uuid.UUID`. A qualified type may start with `*` or `[]`.

For a column, the generator looks for a type in this order: your override for its native type, your override for its scalar, the built-in native mapping, the built-in scalar mapping.

## Struct tags

`structTags` lists the tags to write. Each entry is a tag key, optionally followed by a colon and a naming:

| Naming | Value for a field `createdAt @map("created_at")` |
|---|---|
| `field` | `createdAt`, the Prisma field name. The default for every tag but `db`. |
| `column` | `created_at`, the database column. The default for `db`. |
| `snake` | `created_at` |
| `camel` | `createdAt` |
| `pascal` | `CreatedAt`, the Go field name |

```prisma
structTags = ["json:snake", "db", "yaml", "bson:column"]
omitempty  = ["json", "yaml"]
```

A relation field gets `-` in tags that use the `column` naming, and its name with `,omitempty` everywhere else. Set `structTags = []` for no tags.

## Enums

By default an enum becomes an integer type with `iota` constants, and enumer supplies the methods:

```go
//go:generate enumer -type=Role -json -sql -text -trimprefix=Role
type Role int

const (
	RoleAdmin Role = iota
	RoleUser
)
```

With `enumType = "string"` the constants hold the value stored in the database (the `@map` name if there is one), and nothing else needs to run:

```go
type Role string

const (
	RoleAdmin Role = "ADMIN"
	RoleUser  Role = "USER"
)
```

The generator's own enumer run and a later `go generate` write identical files, so you can use either or both.

To use a tool other than enumer, turn enumer off and set the directive: `enumer = "false"`, `enumDirective = "stringer -type={name}"`.

## Query inputs

`inputs` turns on Prisma's query input types as Go structs. They carry JSON tags with Prisma's field and operator names, so a value marshals to Prisma-style JSON. They are modelled on Prisma's client inputs but are not a drop-in for them: see [Differences from Prisma's inputs](#differences-from-prismas-inputs).

| Family | Types generated per model |
|---|---|
| `where` | `UserWhereInput`, `UserRelationFilter`, `UserListRelationFilter` |
| `whereUnique` | `UserWhereUniqueInput` |
| `orderBy` | `UserOrderByWithRelationInput` |
| `create` | `UserUncheckedCreateInput` |
| `update` | `UserUncheckedUpdateInput` |
| `select` | `UserSelect` |
| `include` | `UserInclude` |

Use `inputs = "all"` for every family.

```go
where := store.UserWhereInput{
	Email: &store.StringFilter{Contains: new("@example.com"), Mode: store.QueryModeInsensitive},
	Role:  &store.Filter[store.Role]{In: []store.Role{store.RoleAdmin, store.RoleMember}},
	Orders: &store.OrderListRelationFilter{
		Some: &store.OrderWhereInput{TotalCents: &store.RangeFilter[int]{Gte: new(10_000)}},
	},
}
```

`new` with a value, as used above, needs Go 1.26. On earlier versions take the address of a variable instead.

The filters are generic over the column's Go type, so they follow your `types` overrides: `Filter[T]` (equality), `RangeFilter[T]` (adds `lt`, `lte`, `gt`, `gte`), `StringFilter` (adds `contains`, `startsWith`, `endsWith`, `mode`), `ListFilter[T]` for scalar lists, and a `Nullable` variant of each with `IsNull`. Updates use `FieldUpdate[T]`, `NumericFieldUpdate[T]` (`increment`, `decrement`, `multiply`, `divide`), `ListFieldUpdate[T]` and their `Nullable` variants.

### Differences from Prisma's inputs

- Create and update inputs are the `Unchecked` forms, which take foreign keys directly. Nested relation writes (`create`, `connect`, `connectOrCreate` and `upsert` inside a create or update) are not generated.
- Aggregate and group-by inputs are not generated.
- A nullable filter has `isNull`. Prisma writes that as `equals: null`, which a Go pointer cannot tell apart from "not set".
- `WhereUniqueInput` lists the columns of a composite key or unique group as separate fields. Prisma nests them in one compound field.
- Order-by inputs cover columns and to-one relations, not counts of to-many relations.
- A nil slice and an empty slice both drop out of the JSON, so `in: []` cannot be expressed.

## Layouts

| Layout | Files |
|---|---|
| `emitSingle` | `models.go` with enums, models and inputs. |
| `emitPerFile` | `users.prisma` becomes `users.go`, holding that file's enums, models and inputs. Shared input types go to `inputs.go`. |
| `emitPerModel` | `user.go` per model with its struct and inputs, `enums.go`, and `inputs.go` for the shared input types. |

On each run the generator deletes the Go files it wrote earlier and no longer writes, such as the file of a model you removed. It recognises its own files by their first line and leaves every other file alone. With `enumer` on, it also deletes enumer output for enums that no longer exist.

A file name that the go tool would read as a build constraint gets `_gen` appended: a model called `UserWindows` is written to `user_windows_gen.go`.

## Moving from prisma2go

Add the generator block, then delete the DMMF script, the `prisma2go generate` step and `.prisma2go.yaml`.

| `.prisma2go.yaml` | Generator block |
|---|---|
| `output: gomodels/models.go` | `output = "../gomodels"` (relative to the schema file) and `fileName = "models.go"` |
| `package: prisma` | `package = "prisma"` |
| `json_tags: false` | `structTags = ["db"]` |
| `db_tags: false` | `structTags = ["json"]` |
| `json_omitempty: false` | `omitempty = []` |
| `uuid_package: ""` | `types = ["db.Uuid=string"]` |
| `decimal_package: "github.com/shopspring/decimal"` | `types = ["Decimal=github.com/shopspring/decimal.Decimal"]` |
| `no_enumer: true` | `enumer = "false"` |

The generated file is then identical to prisma2go's, apart from the name in its first line.

### Behaviour kept from prisma2go

These are unchanged so that existing output does not move. Each can be worked around with an option.

- A `@@unique` group is listed twice in the comment above a model, once from each place Prisma reports it.
- Enum constants are the enum name followed by the value in Pascal case, so `FDLStatus.FDL_STATUS_DRAFT` becomes `FDLStatusFdlStatusDraft`.
- An integer enum's first value is zero, and `omitempty` drops a zero from JSON. A defaulted enum column holding its first value is therefore left out when marshalled. Use `enumType = "string"` or `omitempty = []` if that matters to you.
- Names are not rewritten to Go initialisms unless you list them: `userId` becomes `UserId`, or `UserID` with `initialisms = ["ID"]`.
- The first line of the file is directly above the package clause, so Go reads it as the package comment.

One thing differs: when the generated code does not parse, prisma2go wrote it unformatted and warned. This generator stops with gofmt's error instead.

## Examples

Both examples are complete projects with their generated Go committed, and each has an `example_test.go` that uses the output.

- [`examples/basic`](examples/basic): one schema file, every option at its default.
- [`examples/crud-inputs`](examples/crud-inputs): a multi-file schema, one Go file per model, string enums and query inputs.

## Development

```bash
task install   # pnpm install
task test      # unit tests, then a real `prisma generate` over test/e2e/schema
task ci        # everything CI runs
task --list
```

`task ci` needs Go 1.27 or later and enumer. It typechecks, runs the tests, compiles and vets the Go generated from the test schema, regenerates the examples, and fails if they differ from what is committed.

The tests are in three layers:

| Layer | Where | What it checks |
|---|---|---|
| Unit | `test/*.test.ts` | Naming, type mapping, option parsing, rendering and layouts, against small hand-built schemas. The prisma2go test cases are carried over. |
| End to end | `test/e2e.test.ts` | Runs the Prisma CLI over `test/e2e/schema` with four generator blocks and compares each file with `test/e2e/expected`. `task test:update` rewrites the expected files. |
| Go | `task test:go`, `task examples` | Builds and vets the generated code, and runs the examples' tests. |

## Acknowledgements

This project stands on two generators by [Lexmata](https://github.com/Lexmata):

- [prisma-ent-generator](https://github.com/Lexmata/prisma-ent-generator) is the inspiration for this generator and the source of how it is built: a TypeScript generator on `@prisma/generator-helper` that reads Prisma's DMMF and writes Go source, with its mapping, field and file-writing steps kept apart and tested one by one.
- [prisma-rust-generator](https://github.com/Lexmata/prisma-rust-generator) is the source of the query input surface (which input types exist for a model and what goes in each), the three output layouts, mapping declarations back to their `.prisma` files, and pruning stale output by its header line.

Both are MIT licensed; see [NOTICE](NOTICE).

The mapping from Prisma to Go, the naming rules and the default struct tags come from [prisma2go](https://github.com/tredy-ai/prisma2go).

## License

MIT. See [LICENSE](LICENSE).
