import { NextResponse } from "next/server";
import { shipment001 } from "../../../../fixtures/shipment-001/extraction";

/**
 * The sample shipment's hand-transcribed extraction, so the app can be tried without a
 * model API key. It is what a perfect extractor returns for the three sample PDFs.
 */
export function GET() {
  return NextResponse.json({ documents: shipment001 });
}
