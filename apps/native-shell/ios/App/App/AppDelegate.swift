import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    private let themePreferenceKey = "CapacitorStorage.dodgey-deals-theme"

    private func applySavedTheme() {
        // Capacitor Preferences stores the web app's Display choice in the
        // CapacitorStorage UserDefaults suite. Read it before the bridge is
        // ready so the native launch screen and the WebView start in the same
        // app-owned appearance, independent of the device appearance.
        let savedTheme = UserDefaults.standard.string(forKey: themePreferenceKey)
        let interfaceStyle: UIUserInterfaceStyle = savedTheme == "dark" ? .dark : .light
        window?.overrideUserInterfaceStyle = interfaceStyle

        let appBackground = UIColor(named: "LaunchBackground") ?? UIColor(red: 250.0 / 255.0, green: 248.0 / 255.0, blue: 244.0 / 255.0, alpha: 1.0)
        window?.backgroundColor = appBackground
        window?.rootViewController?.overrideUserInterfaceStyle = interfaceStyle
        window?.rootViewController?.view.backgroundColor = appBackground
    }

    func application(_ application: UIApplication, willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        applySavedTheme()
        return true
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Repeat after the storyboard has connected the window and root view
        // controller. This also keeps the native safe-area background aligned
        // with the saved Display choice after the launch storyboard hands off.
        applySavedTheme()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
