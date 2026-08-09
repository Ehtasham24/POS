import { useEffect, useState } from "react";
import * as printerConnection from "utils/thermalPrinter/connection";

// Reactive view over the thermalPrinter connection singleton, so multiple components
// (e.g. the Company page's printer card) stay in sync without prop-drilling.
export default function useThermalPrinterStatus() {
  const [status, setStatus] = useState(printerConnection.getStatus);

  useEffect(() => printerConnection.subscribe(setStatus), []);

  return {
    ...status,
    bluetoothSupported: printerConnection.isBluetoothSupported(),
    usbSupported: printerConnection.isUsbSupported(),
    connectBluetooth: printerConnection.connectBluetooth,
    connectUsb: printerConnection.connectUsb,
    disconnect: printerConnection.disconnect,
  };
}
