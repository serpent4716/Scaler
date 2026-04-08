import { useState, useEffect, useCallback } from 'react';

export function useFetch(fetchFn, deps = []) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const run = useCallback(() => {
    setLoading(true);
    fetchFn()
      .then(d => { setData(d); setError(null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refetch: run };
}
