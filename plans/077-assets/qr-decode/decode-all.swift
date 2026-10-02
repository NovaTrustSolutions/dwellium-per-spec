// Decode EVERY QR code in one PNG with Apple's CIDetector and print one JSON line per code.
// Build + run:  swiftc -O decode-all.swift -o decode-all && ./decode-all <image.png>
import Foundation
import CoreImage
import AppKit
let args = CommandLine.arguments
guard args.count == 2, let img = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else { print("usage: decode-all <png>"); exit(2) }
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
let feats = det.features(in: img) as! [CIQRCodeFeature]
for f in feats {
    let b = f.bounds
    let msg = (f.messageString ?? "").replacingOccurrences(of: "\"", with: "\\\"")
    print("{\"message\":\"\(msg)\",\"x\":\(Int(b.minX)),\"y\":\(Int(b.minY)),\"w\":\(Int(b.width)),\"h\":\(Int(b.height))}")
}
exit(0)
