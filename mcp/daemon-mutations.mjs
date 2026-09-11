const mutationToolNames = new Set([
  'create_new_file',
  'delete_file',
  'import_file',
  'insert_measure',
  'edit_measure',
  'delete_measures',
  'add_notation',
  'edit_notations',
  'delete_notations',
]);

const unavailable = (error) => ({
  isError: true,
  structuredContent: { errorCode: 'DAEMON_UNAVAILABLE' },
  content: [{ type: 'text', text: error instanceof Error ? error.message : 'The Chorale daemon is unavailable.' }],
});

/**
 * Keep score writes in one daemon process without sharing tab-local view state
 * between browser windows or stdio clients.
 */
export const proxyDocumentMutations = (handlers, port = 1685, fetchImpl = fetch) => {
  const proxied = { ...handlers };
  for (const toolName of mutationToolNames) {
    proxied[toolName] = async (input = {}) => {
      try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/v1/tools/${toolName}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(10_000),
        });
        return await response.json();
      } catch (error) {
        return unavailable(error);
      }
    };
  }
  return proxied;
};
