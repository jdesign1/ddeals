import Capacitor

final class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // Capacitor auto-registers the plugins listed in capacitor.config.json.
        // Because this app's StoreKit bridge is app-owned and not in that
        // generated list, register an instance explicitly. registerPluginType
        // is ignored while auto-registration is enabled.
        bridge?.registerPluginInstance(DodgySubscriptionsPlugin())
    }
}
