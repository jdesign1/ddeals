import Capacitor

final class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(DodgySubscriptionsPlugin.self)
    }
}
