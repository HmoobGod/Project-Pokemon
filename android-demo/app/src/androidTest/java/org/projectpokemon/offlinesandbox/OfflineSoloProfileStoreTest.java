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
}
