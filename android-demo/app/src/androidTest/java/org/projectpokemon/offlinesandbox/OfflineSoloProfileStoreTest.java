package org.projectpokemon.offlinesandbox;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.UUID;

import static org.junit.Assert.*;

/**
 * Tests a disposable app-private local metadata slot. Does not import or
 * modify browser saves, Standard progression, or online accounts.
 */
@RunWith(AndroidJUnit4.class)
public final class OfflineSoloProfileStoreTest {
    @Test
    public void freshIdentityIsStableAndContainsNoProgression() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences prefs = context.getSharedPreferences(
                "offline_solo_profile_metadata_v1", Context.MODE_PRIVATE);
        String before = prefs.getString("fresh_profile_v1", null);

        OfflineSoloProfileStore.Profile first = OfflineSoloProfileStore.openOrCreate(context);
        OfflineSoloProfileStore.Profile second = OfflineSoloProfileStore.openOrCreate(context);

        assertEquals(OfflineSoloProfileStore.NAMESPACE, first.namespace);
        assertEquals(first.namespace, second.namespace);
        assertEquals(first.id, second.id);
        assertEquals(first.createdAtEpochMillis, second.createdAtEpochMillis);
        assertTrue(first.createdAtEpochMillis >= 0);
        assertTrue(first.id.startsWith("solo-"));

        String after = prefs.getString("fresh_profile_v1", null);
        assertNotNull("Fresh profile should be private and persistent", after);
        if (before != null) {
            assertEquals("Reopening MUST NOT overwrite prior raw profile bytes", before, after);
        }
        JSONObject object = new JSONObject(after);
        Set<String> fields = new HashSet<>();
        Iterator<String> names = object.keys();
        while (names.hasNext()) fields.add(names.next());
        Set<String> expected = new HashSet<>();
        expected.add("namespace");
        expected.add("schema");
        expected.add("id");
        expected.add("createdAtEpochMillis");
        assertEquals("No currency/reward/unlock/purchase/mission fields", expected, fields);
    }

    @Test
    public void corruptOrForgedProfilesFailClosedWithoutStorageWrites() {
        String[] forged = {
                "",
                "[]",
                "{}",
                "{\"namespace\":\"other\",\"schema\":1,\"id\":\"solo-not-a-uuid\",\"createdAtEpochMillis\":1}",
                "{\"namespace\":\"org.projectpokemon.offlinesandbox.profile.metadata.v1\",\"schema\":1,\"id\":\"solo-not-a-uuid\",\"createdAtEpochMillis\":1}",
                "{\"namespace\":\"org.projectpokemon.offlinesandbox.profile.metadata.v1\",\"schema\":1,\"id\":\"solo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"createdAtEpochMillis\":-1}",
                "{\"namespace\":\"org.projectpokemon.offlinesandbox.profile.metadata.v1\",\"schema\":1,\"id\":\"solo-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\",\"createdAtEpochMillis\":1,\"pokemonUnlocked\":[1]}"
        };
        for (String raw : forged) {
            try {
                OfflineSoloProfileStore.parseStrict(raw);
                fail("Corrupt or unexpected offline profile was accepted: " + raw);
            } catch (IllegalStateException expected) {
                assertNotNull(expected);
            }
        }
    }

    @Test
    public void persistedCorruptionNeverRewritesRawBytesInDisposableFixture() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Unique fixture namespace: NEVER touch the app's real profile metadata
        // or any imported/Standard/browser save, even in a failing test.
        String fixtureName = "offline_solo_test_fixture_" + UUID.randomUUID();
        SharedPreferences fixture = context.getSharedPreferences(fixtureName, Context.MODE_PRIVATE);
        final String key = "fresh_profile_v1";
        try {
            assertFalse(fixture.contains(key));
            String malformed = "{\"namespace\":\"unexpected\",\"schema\":1,\"id\":\"not-a-profile\"}";
            assertTrue(fixture.edit().putString(key, malformed).commit());
            try {
                OfflineSoloProfileStore.openOrCreate(fixture);
                fail("Corrupt persisted bytes must halt rather than auto-create an identity");
            } catch (IllegalStateException expected) {
                assertNotNull(expected);
            }
            assertEquals("Corrupt raw bytes were replaced", malformed, fixture.getString(key, null));
            assertEquals("No other records may be written", 1, fixture.getAll().size());

            // Android SharedPreferences may contain an unexpected *value type*.
            // That original raw slot must also be preserved without migration.
            assertTrue(fixture.edit().putInt(key, 17).commit());
            try {
                OfflineSoloProfileStore.openOrCreate(fixture);
                fail("Wrong-type existing record must fail closed");
            } catch (IllegalStateException expected) {
                assertNotNull(expected);
            }
            assertEquals(Integer.valueOf(17), fixture.getAll().get(key));
            assertEquals(1, fixture.getAll().size());
        } finally {
            // Delete only the uniquely named disposable fixture we created.
            assertTrue(context.deleteSharedPreferences(fixtureName));
        }
    }
    @Test
    public void unexpectedPrivateKeysNeverCreateOrRewriteIdentity() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        final String profileKey = "fresh_profile_v1";
        final String foreignKey = "unrecognized_older_metadata";
        final String rawForeignValue = "opaque string; must survive untouched";
        for (int scenario = 0; scenario < 2; scenario++) {
            // Two separately named disposable fixtures; never clear or inspect
            // the actual app profile slot or any Standard/browser game save.
            String fixtureName = "offline_unknown_key_test_" + UUID.randomUUID();
            SharedPreferences fixture = context.getSharedPreferences(fixtureName, Context.MODE_PRIVATE);
            try {
                if (scenario == 1) {
                    // A correctly initialized record must also reject unknown
                    // sibling keys rather than silently ignoring them.
                    assertNotNull(OfflineSoloProfileStore.openOrCreate(fixture));
                } else {
                    assertFalse(fixture.contains(profileKey));
                }
                assertTrue(fixture.edit().putString(foreignKey, rawForeignValue).commit());
                java.util.Map<String, ?> before = fixture.getAll();
                try {
                    OfflineSoloProfileStore.openOrCreate(fixture);
                    fail("Unexpected private slots must be preserved, not treated as fresh");
                } catch (IllegalStateException expected) {
                    assertNotNull(expected);
                }
                assertEquals("Existing raw slots must remain byte-for-byte equivalent",
                        before, fixture.getAll());
                assertEquals(rawForeignValue, fixture.getString(foreignKey, null));
                if (scenario == 0) {
                    assertFalse("Do not inject a fresh identity over unknown data",
                            fixture.contains(profileKey));
                } else {
                    assertTrue("Existing identity was lost", fixture.contains(profileKey));
                }
            } finally {
                assertTrue("Only disposable fixture cleanup is allowed",
                        context.deleteSharedPreferences(fixtureName));
            }
        }
    }

}
