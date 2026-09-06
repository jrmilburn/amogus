// DOM interaction tests exercise the real controllers; CSS is checked by build/lint.
export async function load(url, context, nextLoad) {
  if (url.endsWith('.css'))
    return { format: 'module', source: '', shortCircuit: true };
  return nextLoad(url, context);
}
