import { describe, expect, it } from 'vitest';
import { render } from '../src/layout.js';
import { config, fixture } from './helpers.js';

const all = () => render(fixture('basic'), config({ inputs: 'all' }));

describe('inputs', () => {
  it('where: one filter per column, relation filters and the boolean combinators', () => {
    const out = all();
    for (const want of [
      'package models',
      'type UserWhereInput struct {',
      'Id *RangeFilter[int32] `json:"id,omitempty"`',
      'Email *StringFilter `json:"email,omitempty"`',
      'Name *StringNullableFilter `json:"name,omitempty"`',
      'Role *Filter[Role] `json:"role,omitempty"`',
      'CreatedAt *RangeFilter[time.Time] `json:"createdAt,omitempty"`',
      'Posts *PostListRelationFilter `json:"posts,omitempty"`',
      'AND []UserWhereInput `json:"AND,omitempty"`',
      'OR []UserWhereInput `json:"OR,omitempty"`',
      'NOT []UserWhereInput `json:"NOT,omitempty"`',
      'Author *UserRelationFilter `json:"author,omitempty"`',
      'type UserRelationFilter struct {',
      'type PostListRelationFilter struct {',
      'type Filter[T any] struct {',
      'type StringFilter struct {',
      'type QueryMode string',
    ]) {
      expect(out).toContain(want);
    }
  });

  it('where: picks the filter family from the Prisma type', () => {
    const out = render(fixture('complex'), config({ inputs: ['where'] }));
    expect(out).toContain('Id *Filter[uuid.UUID] `json:"id,omitempty"`');
    expect(out).toContain('Tags *ListFilter[string] `json:"tags,omitempty"`');
    expect(out).toContain('Metadata *NullableFilter[json.RawMessage] `json:"metadata,omitempty"`');
    expect(out).toContain('Budget *NullableRangeFilter[string] `json:"budget,omitempty"`');
    expect(out).toContain('Priority *NullableFilter[Priority] `json:"priority,omitempty"`');
    expect(out).toContain('"github.com/google/uuid"');
  });

  it('whereUnique: the id and unique columns, each optional', () => {
    const out = all();
    expect(out).toContain('type UserWhereUniqueInput struct {\n\tId *int32 `json:"id,omitempty"`\n\tEmail *string `json:"email,omitempty"`\n}');
  });

  it('whereUnique: includes the columns of composite keys', () => {
    const out = render(fixture('complex'), config({ inputs: ['whereUnique'] }));
    expect(out).toContain(
      'type ProjectWhereUniqueInput struct {\n\tId *int64 `json:"id,omitempty"`\n\tName *string `json:"name,omitempty"`\n\tOrganizationId *uuid.UUID `json:"organizationId,omitempty"`\n}',
    );
  });

  it('orderBy: a sort order per column and nested ordering for to-one relations', () => {
    const out = all();
    expect(out).toContain('type PostOrderByWithRelationInput struct {');
    expect(out).toContain('Title SortOrder `json:"title,omitempty"`');
    expect(out).toContain('Author *UserOrderByWithRelationInput `json:"author,omitempty"`');
    expect(out).not.toContain('Posts *PostOrderByWithRelationInput');
    expect(out).toContain('SortOrderDesc SortOrder = "desc"');
  });

  it('create: required columns by value, defaulted and optional columns by pointer', () => {
    const out = all();
    expect(out).toContain(
      [
        'type UserUncheckedCreateInput struct {',
        '\tId *int32 `json:"id,omitempty"`',
        '\tEmail string `json:"email"`',
        '\tName *string `json:"name,omitempty"`',
        '\tRole Role `json:"role"`',
        '\tCreatedAt *time.Time `json:"createdAt,omitempty"`',
        '}',
      ].join('\n'),
    );
  });

  it('update: every column optional, wrapped in its update operation', () => {
    const out = all();
    expect(out).toContain(
      [
        'type UserUncheckedUpdateInput struct {',
        '\tId *NumericFieldUpdate[int32] `json:"id,omitempty"`',
        '\tEmail *FieldUpdate[string] `json:"email,omitempty"`',
        '\tName *NullableFieldUpdate[string] `json:"name,omitempty"`',
        '\tRole *FieldUpdate[Role] `json:"role,omitempty"`',
        '\tCreatedAt *FieldUpdate[time.Time] `json:"createdAt,omitempty"`',
        '}',
      ].join('\n'),
    );
    const complex = render(fixture('complex'), config({ inputs: ['update'] }));
    expect(complex).toContain('Tags *ListFieldUpdate[string] `json:"tags,omitempty"`');
    expect(complex).toContain('Budget *NullableNumericFieldUpdate[string] `json:"budget,omitempty"`');
  });

  it('select and include: a flag per column and per relation', () => {
    const out = all();
    expect(out).toContain('type UserSelect struct {\n\tId bool `json:"id,omitempty"`');
    expect(out).toContain('type UserInclude struct {\n\tPosts bool `json:"posts,omitempty"`\n}');
  });

  it('emits only the requested families and the shared types they need', () => {
    const out = render(fixture('basic'), config({ inputs: ['create'] }));
    expect(out).toContain('type UserUncheckedCreateInput struct {');
    for (const absent of ['WhereInput', 'Filter[', 'SortOrder', 'FieldUpdate', 'UserSelect', 'UserInclude']) {
      expect(out).not.toContain(absent);
    }
  });

  it('relations = false drops relation filters, ordering and includes', () => {
    const out = render(fixture('basic'), config({ inputs: 'all', relations: 'false' }));
    expect(out).not.toContain('RelationFilter');
    expect(out).not.toContain('UserInclude');
    expect(out).not.toMatch(/\tAuthor /);
  });

  it('follows initialisms and type overrides', () => {
    const out = render(fixture('basic'), config({ inputs: ['where'], initialisms: ['ID'], types: ['Int=int'] }));
    expect(out).toContain('AuthorID *RangeFilter[int] `json:"authorId,omitempty"`');
  });

  it('refuses a model whose input name collides with another type', () => {
    const dm = fixture('basic');
    const clash = { ...dm, models: [...dm.models, { ...dm.models[0]!, name: 'UserWhereInput', dbName: null }] };
    expect(() => render(clash as never, config({ inputs: ['where'] }))).toThrow(/UserWhereInput/);
  });
});
