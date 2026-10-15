package __APP_PACKAGE__;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Opens Android system settings through native Intents, not WebView URL navigation. */
@CapacitorPlugin(name = "SystemSettings")
public class SystemSettingsPlugin extends Plugin {

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        String packageName = getContext().getPackageName();
        Intent[] candidates = new Intent[] {
            new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + packageName)),
            new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + packageName))
        };

        for (Intent intent : candidates) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (intent.resolveActivity(getContext().getPackageManager()) != null) {
                    getActivity().startActivity(intent);
                    JSObject result = new JSObject();
                    result.put("opened", true);
                    result.put("screen", intent.getAction());
                    call.resolve(result);
                    return;
                }
            } catch (Exception exception) {
                android.util.Log.w("SystemSettings", "Unable to open " + intent.getAction(), exception);
            }
        }

        call.reject("Android could not open battery or app settings");
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:" + getContext().getPackageName()));
        try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Android could not open app settings", exception);
        }
    }
}
