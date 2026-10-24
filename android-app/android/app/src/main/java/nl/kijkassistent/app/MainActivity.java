package nl.kijkassistent.app;

import android.content.SharedPreferences;
import android.os.Bundle;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.BridgeActivity;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Laat zien dat er een nieuwe versie in de Play Store staat.
 *
 * Google toont zelf het scherm "Update beschikbaar". Kiest de gebruiker "Updaten", dan wordt de update op de
 * achtergrond gedownload en vragen we daarna of de app opnieuw mag starten. Kiest de gebruiker "Nee, bedankt",
 * dan vragen we het pas een dag later weer.
 *
 * Dit werkt alleen als de app uit de Play Store komt (ook de gesloten test). Bij een testversie uit Android Studio
 * gebeurt er niets.
 */
public class MainActivity extends BridgeActivity {

    private static final String PREFS = "app_update";
    private static final String KEY_ASKED_VERSION = "asked_version";
    private static final String KEY_ASKED_AT = "asked_at";
    private static final long ASK_AGAIN_AFTER_MS = 24L * 60 * 60 * 1000;

    private AppUpdateManager appUpdateManager;
    private ActivityResultLauncher<IntentSenderRequest> updateLauncher;
    private AlertDialog restartDialog;

    private final InstallStateUpdatedListener installListener = state -> {
        if (state.installStatus() == InstallStatus.DOWNLOADED) {
            askToRestart();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        appUpdateManager = AppUpdateManagerFactory.create(this);
        appUpdateManager.registerListener(installListener);
        // Het resultaat (updaten of niet) hoeven we niet te gebruiken: de listener meldt wanneer de download klaar is.
        updateLauncher = registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), result -> {});
        checkForUpdate();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (appUpdateManager == null) return;
        // Is de update gedownload terwijl de app op de achtergrond stond? Dan alsnog vragen om opnieuw te starten.
        appUpdateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.installStatus() == InstallStatus.DOWNLOADED) {
                askToRestart();
            }
        });
    }

    @Override
    public void onDestroy() {
        if (appUpdateManager != null) {
            appUpdateManager.unregisterListener(installListener);
        }
        if (restartDialog != null) {
            restartDialog.dismiss();
        }
        super.onDestroy();
    }

    private void checkForUpdate() {
        // Bij een fout (bijvoorbeeld geen Play Store) komt er geen antwoord en doen we niets.
        appUpdateManager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) return;
            if (!info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) return;
            if (!mayAsk(info)) return;
            try {
                appUpdateManager.startUpdateFlowForResult(
                    info, updateLauncher, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build());
                rememberAsked(info);
            } catch (Exception ignored) {
                // Lukt het niet, dan werkt Play de app later vanzelf bij.
            }
        });
    }

    /** Niet bij elke start vragen: per nieuwe versie hoogstens eens per dag. */
    private boolean mayAsk(AppUpdateInfo info) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int askedVersion = prefs.getInt(KEY_ASKED_VERSION, -1);
        long askedAt = prefs.getLong(KEY_ASKED_AT, 0);
        if (askedVersion != info.availableVersionCode()) return true;
        return System.currentTimeMillis() - askedAt > ASK_AGAIN_AFTER_MS;
    }

    private void rememberAsked(AppUpdateInfo info) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putInt(KEY_ASKED_VERSION, info.availableVersionCode())
            .putLong(KEY_ASKED_AT, System.currentTimeMillis())
            .apply();
    }

    private void askToRestart() {
        if (isFinishing() || (restartDialog != null && restartDialog.isShowing())) return;
        restartDialog = new AlertDialog.Builder(this)
            .setTitle(R.string.update_ready_title)
            .setMessage(R.string.update_ready_message)
            .setPositiveButton(R.string.update_restart, (d, w) -> appUpdateManager.completeUpdate())
            .setNegativeButton(R.string.update_later, null)
            .show();
    }
}
