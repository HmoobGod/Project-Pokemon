package org.projectpokemon.offlinesandbox;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.UUID;

/**
 * First-run, metadata-only identity for a distinct disposable Android demo app.
 *
 * NO Pokémon, currencies, purchases, awards, progress counters or imported
 * accounts are stored here. There is deliberately no reset, import or
 * overwrite path. Authenticated game progression is NOT implemented.
 */
final class OfflineSoloProfileStore {
    static final String NAMESPACE = "org.projectpokemon.offlinesandbox.profile.metadata.v1";
    private static final String PREFERENCES = "offline_solo_profile_metadata_v1";
    private static final String RECORD_KEY = "fresh_profile_v1";
    private static final int SCHEMA = 1;

    static final class Profile {
        final String namespace;
        final int schema;
        final String id;
        final long createdAtEpochMillis;

        private Profile(String namespace, int schema, String id, long createdAtEpochMillis) {
            this.namespace = namespace;
            this.schema = schema;
            this.id = id;
            this.createdAtEpochMillis = createdAtEpochMillis;
        }
    }

    private OfflineSoloProfileStore() {}

    static synchronized Profile openOrCreate(Context context) {
        if (context == null) throw new IllegalArgumentException("Context required");
        final SharedPreferences preferences = context.getApplicationContext()
                .getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        return openOrCreate(preferences);
    }

    // Package-private seam for real Android instrumentation against isolated,
    // disposable preference fixtures. Production always uses the fixed private
    // namespace above; tests must never mutate the actual metadata slot.
    static synchronized Profile openOrCreate(SharedPreferences preferences) {
        if (preferences == null) throw new IllegalArgumentException("Preferences required");

        // A present but invalid record MUST NOT be replaced by a fresh profile.
        if (preferences.contains(RECORD_KEY)) {
            final String raw;
            try {
                raw = preferences.getString(RECORD_KEY, null);
            } catch (ClassCastException ex) {
                throw new IllegalStateException("Unreadable offline profile; no reset", ex);
            }
            return parseStrict(raw);
        }

        final Profile fresh = new Profile(
                NAMESPACE, SCHEMA, "solo-" + UUID.randomUUID(), System.currentTimeMillis());
        final String serialized = toJson(fresh);
        if (!preferences.edit().putString(RECORD_KEY, serialized).commit()) {
            throw new IllegalStateException("Offline profile write failed; no gameplay unlock");
        }
        // Read back the stored bytes. Never pretend that an unsuccessful write persisted.
        final String persisted = preferences.getString(RECORD_KEY, null);
        final Profile stored = parseStrict(persisted);
        if (!serialized.equals(toJson(stored))) {
            throw new IllegalStateException("Offline profile read-back mismatch");
        }
        return stored;
    }

    static Profile parseStrict(String raw) {
        if (raw == null || raw.length() > 1024 || raw.isEmpty()) {
            throw new IllegalStateException("Missing or oversized offline profile; no reset");
        }
        try {
            JSONObject value = new JSONObject(raw);
            Set<String> required = new HashSet<>();
            required.add("namespace");
            required.add("schema");
            required.add("id");
            required.add("createdAtEpochMillis");
            int count = 0;
            Iterator<String> keys = value.keys();
            while (keys.hasNext()) {
                if (!required.contains(keys.next())) {
                    throw new IllegalStateException("Unknown offline profile field; no reset");
                }
                count++;
            }
            if (count != required.size()) {
                throw new IllegalStateException("Incomplete offline profile; no reset");
            }
            Object ns = value.get("namespace");
            Object schema = value.get("schema");
            Object id = value.get("id");
            Object created = value.get("createdAtEpochMillis");
            if (!(ns instanceof String) || !NAMESPACE.equals(ns)
                    || !(schema instanceof Integer) || ((Integer) schema) != SCHEMA
                    || !(id instanceof String) || !((String) id).matches(
                            "solo-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
                    || !(created instanceof Number) || ((Number) created).longValue() < 0
                    || ((Number) created).doubleValue() != ((Number) created).longValue()) {
                throw new IllegalStateException("Invalid offline profile; no reset");
            }
            return new Profile(NAMESPACE, SCHEMA, (String) id, ((Number) created).longValue());
        } catch (JSONException ex) {
            throw new IllegalStateException("Unreadable offline profile; no reset", ex);
        }
    }

    private static String toJson(Profile profile) {
        try {
            return new JSONObject()
                    .put("namespace", profile.namespace)
                    .put("schema", profile.schema)
                    .put("id", profile.id)
                    .put("createdAtEpochMillis", profile.createdAtEpochMillis)
                    .toString();
        } catch (JSONException ex) {
            throw new IllegalStateException("Could not serialize offline profile", ex);
        }
    }
}
