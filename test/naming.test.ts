import { describe, expect, it } from 'vitest';
import { toCamelCase, toEnumConstName, toPascalCase, toSnakeCase } from '../src/naming.js';

describe('toPascalCase', () => {
  // Table carried over from prisma2go's naming_test.go.
  it.each([
    ['', ''],
    ['user', 'User'],
    ['user_name', 'UserName'],
    ['userName', 'UserName'],
    ['user-name', 'UserName'],
    ['user name', 'UserName'],
    ['USER_NAME', 'USERNAME'],
    ['id', 'Id'],
    ['ID', 'ID'],
    ['agent_relationships_agent1IdToagents', 'AgentRelationshipsAgent1IdToagents'],
  ])('%s -> %s', (input, expected) => {
    expect(toPascalCase(input)).toBe(expected);
  });

  it.each([
    ['userId', 'UserID'],
    ['id', 'ID'],
    ['api_url', 'APIURL'],
    ['identity', 'Identity'],
    ['avatarUrl', 'AvatarURL'],
  ])('upper-cases configured initialisms: %s -> %s', (input, expected) => {
    expect(toPascalCase(input, new Set(['ID', 'URL', 'API']))).toBe(expected);
  });
});

describe('toEnumConstName', () => {
  it.each([
    ['Role', 'ADMIN', 'RoleAdmin'],
    ['Status', 'IN_PROGRESS', 'StatusInProgress'],
    ['FDLStatus', 'FDL_STATUS_DRAFT', 'FDLStatusFdlStatusDraft'],
  ])('%s + %s -> %s', (enumName, value, expected) => {
    expect(toEnumConstName(enumName, value)).toBe(expected);
  });
});

describe('tag naming', () => {
  it.each([
    ['organizationId', 'organization_id'],
    ['userID', 'user_id'],
    ['HTTPServer', 'http_server'],
    ['created_at', 'created_at'],
  ])('toSnakeCase %s -> %s', (input, expected) => {
    expect(toSnakeCase(input)).toBe(expected);
  });

  it.each([
    ['created_at', 'createdAt'],
    ['UserName', 'userName'],
    ['userID', 'userId'],
  ])('toCamelCase %s -> %s', (input, expected) => {
    expect(toCamelCase(input)).toBe(expected);
  });
});
