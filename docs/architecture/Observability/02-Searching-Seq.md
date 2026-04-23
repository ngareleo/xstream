# Searching in Seq

To find all events for a single playback session:

1. Open [http://localhost:5341](http://localhost:5341)
2. In the search bar, filter by trace ID:
   ```
   @TraceId = 'abc123...'
   ```
3. Or filter by component and time:
   ```
   component = 'chunker' and @Timestamp > 2m ago
   ```
4. Use the **Trace** view to see the parent-child span tree for a given `traceId`
