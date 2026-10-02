import Foundation
import CoreImage
import AppKit
let manifest = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: "manifest.json"))) as! [String: String]
let det = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
var fail = 0
for (name, expected) in manifest.sorted(by: { $0.key < $1.key }) {
  guard let img = CIImage(contentsOf: URL(fileURLWithPath: "\(name).png")) else { print(name, "LOAD FAIL"); fail += 1; continue }
  let feats = det.features(in: img) as! [CIQRCodeFeature]
  let got = feats.first?.messageString
  let ok = got == expected
  if !ok { fail += 1 }
  print("\(name): features=\(feats.count) decoded==input: \(ok)", ok ? "" : "got=\(got ?? "nil")")
}
exit(fail == 0 ? 0 : 1)
