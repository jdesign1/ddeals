import Capacitor
import Foundation
import StoreKit

@objc(DodgySubscriptionsPlugin)
public class DodgySubscriptionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DodgySubscriptionsPlugin"
    public let jsName = "DodgySubscriptions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    @objc override public func load() {
        updatesTask = Task { @MainActor [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                guard case .verified(let transaction) = result else { continue }
                let payload = self.transactionPayload(transaction, jwsRepresentation: result.jwsRepresentation)
                await transaction.finish()
                self.notifyListeners("transactionUpdated", data: ["transaction": payload])
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds") as? [String], !productIds.isEmpty else {
            call.reject("At least one Apple product ID is required.", "INVALID_ARGUMENT")
            return
        }

        Task { @MainActor in
            do {
                let products = try await Product.products(for: Array(Set(productIds)))
                let response = products.map { product in
                    [
                        "id": product.id,
                        "displayName": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                        "type": String(describing: product.type)
                    ]
                }
                call.resolve(["products": response])
            } catch {
                call.reject("Apple products could not be loaded.", "PRODUCTS_UNAVAILABLE", error)
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty,
              let accountToken = call.getString("appAccountToken"),
              let appAccountToken = UUID(uuidString: accountToken) else {
            call.reject("A product ID and valid account token are required.", "INVALID_ARGUMENT")
            return
        }

        Task { @MainActor in
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("That Apple product is not available.", "PRODUCT_NOT_FOUND")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Apple could not verify this transaction.", "TRANSACTION_UNVERIFIED")
                        return
                    }
                    let payload = self.transactionPayload(transaction, jwsRepresentation: verification.jwsRepresentation)
                    await transaction.finish()
                    call.resolve(payload)
                case .userCancelled:
                    call.reject("The Apple purchase was cancelled.", "USER_CANCELLED")
                case .pending:
                    call.reject("The Apple purchase is pending approval.", "PENDING")
                @unknown default:
                    call.reject("Apple returned an unknown purchase state.", "UNKNOWN_PURCHASE_STATE")
                }
            } catch {
                call.reject("Apple could not complete the purchase.", "PURCHASE_FAILED", error)
            }
        }
    }

    @objc func currentEntitlements(_ call: CAPPluginCall) {
        Task { @MainActor in
            call.resolve(["transactions": await self.currentEntitlementPayloads()])
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await AppStore.sync()
                call.resolve(["transactions": await self.currentEntitlementPayloads()])
            } catch {
                call.reject("Apple could not restore purchases.", "RESTORE_FAILED", error)
            }
        }
    }

    private func currentEntitlementPayloads() async -> [[String: Any]] {
        var transactions: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            transactions.append(transactionPayload(transaction, jwsRepresentation: result.jwsRepresentation))
        }
        return transactions
    }

    private func transactionPayload(_ transaction: Transaction, jwsRepresentation: String) -> [String: Any] {
        let formatter = ISO8601DateFormatter()
        let environment: String
        if #available(iOS 16.0, *) {
            environment = String(describing: transaction.environment)
        } else {
            environment = "unknown"
        }
        return [
            "productId": transaction.productID,
            "transactionId": String(transaction.id),
            "originalTransactionId": String(transaction.originalID),
            "jwsRepresentation": jwsRepresentation,
            "environment": environment,
            "expiresDate": transaction.expirationDate.map { formatter.string(from: $0) } ?? NSNull(),
            "revocationDate": transaction.revocationDate.map { formatter.string(from: $0) } ?? NSNull()
        ]
    }
}
