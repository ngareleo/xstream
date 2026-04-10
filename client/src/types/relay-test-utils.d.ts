/**
 * Minimal TypeScript declarations for relay-test-utils (v20.x).
 * The package ships only Flow types, so we declare the subset used in stories.
 */
declare module "relay-test-utils" {
  import type { IEnvironment, OperationDescriptor } from "relay-runtime";

  type MockResolverContext = {
    name: string;
    alias: string | null;
    args: Record<string, unknown> | null;
    parentType: string | null;
    returnType: string;
    path: string[];
  };

  type MockResolver = (context: MockResolverContext, generateId: () => number) => unknown;

  type MockResolvers = Record<string, MockResolver | (() => unknown)>;

  interface MockPayloadGeneratorStatic {
    generate(
      operation: OperationDescriptor,
      mockResolvers?: MockResolvers
    ): { data: Record<string, unknown> };
  }

  export const MockPayloadGenerator: MockPayloadGeneratorStatic;

  interface MockEnvironmentMock {
    queueOperationResolver(
      resolver: (operation: OperationDescriptor) => { data: Record<string, unknown> }
    ): void;
    queuePendingOperation(query: unknown, variables: Record<string, unknown>): void;
    getAllOperations(): OperationDescriptor[];
    resolveMostRecentOperation(
      resolver: (operation: OperationDescriptor) => { data: Record<string, unknown> }
    ): void;
    rejectMostRecentOperation(error: Error): void;
  }

  interface MockEnvironment extends IEnvironment {
    mock: MockEnvironmentMock;
  }

  export function createMockEnvironment(): MockEnvironment;
}
