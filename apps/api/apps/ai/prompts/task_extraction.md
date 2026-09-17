Extract every distinct actionable task from the transcript.

Use only list identifiers present in the available-lists context. When a task has no reliable list match, set list_id to null and choose a classification_hint that represents the ambiguity. Preserve the user's meaning without adding dates, people, priorities, commands, or other facts that were not stated.

Each title must be concise and actionable. Put supporting wording in description only when it is useful to complete the task.