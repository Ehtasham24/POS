// Singleton transport manager for direct (no-dialog) ESC/POS printing over Web Bluetooth
// or Web USB. Both APIs only exist in Chromium browsers (Chrome/Edge desktop, Android
// Chrome) — never assume they exist; every entry point below feature-detects first.
//
// BLE service/characteristic UUIDs and USB interface/endpoint layout are NOT standardized
// across printer manufacturers. The UUIDs below match the CC254x-based BLE serial modules
// used by a large share of cheap BLE thermal printers; if a paired printer doesn't expose
// that exact service, we fall back to scanning for the first writable characteristic —
// works for most single-service "dumb serial" printer modules, but isn't guaranteed for
// every model. Use the Test Print button (Company page) to confirm a given unit works.
const KNOWN_BLE_SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455";
const KNOWN_BLE_WRITE_CHARACTERISTIC = "49535343-8841-43f4-a8d4-ecbe34729bb3";

// Most BLE stacks cap a single GATT write around 512 bytes; stay well under that so a
// full receipt (easily 1-2KB of ESC/POS bytes) doesn't get truncated mid-write.
const BLE_WRITE_CHUNK_SIZE = 180;

const STORAGE_KEY = "pos-printer";

const state = {
  type: null, // 'bluetooth' | 'usb' | null
  name: "",
  device: null, // BluetoothDevice | USBDevice
  bleCharacteristic: null, // cached write characteristic for the connected BLE device
  usbEndpoint: null, // { interfaceNumber, endpointNumber } for the connected USB device
};

const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(getStatus()));

export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const getStatus = () => ({ type: state.type, name: state.name });

export const isBluetoothSupported = () => typeof navigator !== "undefined" && !!navigator.bluetooth;
export const isUsbSupported = () => typeof navigator !== "undefined" && !!navigator.usb;

const persistPreference = () => {
  try {
    if (state.type) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ type: state.type, name: state.name }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private mode etc.) — connection still works this session.
  }
};

const findWritableCharacteristic = async (server) => {
  // Try the well-known service first.
  try {
    const service = await server.getPrimaryService(KNOWN_BLE_SERVICE);
    return await service.getCharacteristic(KNOWN_BLE_WRITE_CHARACTERISTIC);
  } catch {
    // Not this printer model — fall through to the generic scan below.
  }

  const services = await server.getPrimaryServices();
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find(
      (c) => c.properties.write || c.properties.writeWithoutResponse
    );
    if (writable) return writable;
  }
  throw new Error("No writable characteristic found on this Bluetooth device");
};

export const connectBluetooth = async () => {
  if (!isBluetoothSupported()) throw new Error("Web Bluetooth isn't supported in this browser");

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [KNOWN_BLE_SERVICE],
  });
  const server = await device.gatt.connect();
  const characteristic = await findWritableCharacteristic(server);

  device.addEventListener("gattserverdisconnected", () => {
    if (state.device === device) disconnect();
  });

  state.type = "bluetooth";
  state.name = device.name || "Bluetooth printer";
  state.device = device;
  state.bleCharacteristic = characteristic;
  state.usbEndpoint = null;
  persistPreference();
  notify();
};

const findUsbBulkOutEndpoint = (device) => {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        const endpoint = alt.endpoints.find((e) => e.direction === "out");
        if (endpoint) {
          return { interfaceNumber: iface.interfaceNumber, endpointNumber: endpoint.endpointNumber };
        }
      }
    }
  }
  return null;
};

export const connectUsb = async () => {
  if (!isUsbSupported()) throw new Error("WebUSB isn't supported in this browser");

  const device = await navigator.usb.requestDevice({ filters: [{}] });
  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);

  const endpoint = findUsbBulkOutEndpoint(device);
  if (!endpoint) throw new Error("No usable USB endpoint found on this printer");

  await device.claimInterface(endpoint.interfaceNumber);

  state.type = "usb";
  state.name = device.productName || "USB printer";
  state.device = device;
  state.usbEndpoint = endpoint;
  state.bleCharacteristic = null;
  persistPreference();
  notify();
};

export const disconnect = async () => {
  try {
    if (state.type === "bluetooth" && state.device?.gatt?.connected) {
      state.device.gatt.disconnect();
    } else if (state.type === "usb" && state.device?.opened) {
      await state.device.close();
    }
  } catch {
    // Device may already be gone (unplugged/out of range) — nothing more to do.
  }
  state.type = null;
  state.name = "";
  state.device = null;
  state.bleCharacteristic = null;
  state.usbEndpoint = null;
  persistPreference();
  notify();
};

// Attempts a silent reconnect to a previously-granted device on app load. Best-effort:
// no-ops quietly if unsupported, nothing was paired before, or the browser requires a
// fresh user gesture — the caller (App.jsx) doesn't need to handle failure specially,
// the print-dialog fallback covers "still not connected" either way.
export const tryAutoReconnect = async () => {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return;
  }
  if (!saved?.type) return;

  try {
    if (saved.type === "bluetooth" && isBluetoothSupported() && navigator.bluetooth.getDevices) {
      const devices = await navigator.bluetooth.getDevices();
      const match = devices.find((d) => d.name === saved.name) || devices[0];
      if (!match) return;
      const server = await match.gatt.connect();
      const characteristic = await findWritableCharacteristic(server);
      match.addEventListener("gattserverdisconnected", () => {
        if (state.device === match) disconnect();
      });
      state.type = "bluetooth";
      state.name = match.name || saved.name;
      state.device = match;
      state.bleCharacteristic = characteristic;
      notify();
    } else if (saved.type === "usb" && isUsbSupported() && navigator.usb.getDevices) {
      const devices = await navigator.usb.getDevices();
      const match = devices[0];
      if (!match) return;
      await match.open();
      if (!match.configuration) await match.selectConfiguration(1);
      const endpoint = findUsbBulkOutEndpoint(match);
      if (!endpoint) return;
      await match.claimInterface(endpoint.interfaceNumber);
      state.type = "usb";
      state.name = match.productName || saved.name;
      state.device = match;
      state.usbEndpoint = endpoint;
      notify();
    }
  } catch (error) {
    console.warn("Thermal printer auto-reconnect failed:", error);
  }
};

export const write = async (bytes) => {
  if (state.type === "bluetooth") {
    if (!state.bleCharacteristic) throw new Error("No Bluetooth printer connected");
    for (let offset = 0; offset < bytes.length; offset += BLE_WRITE_CHUNK_SIZE) {
      const chunk = bytes.slice(offset, offset + BLE_WRITE_CHUNK_SIZE);
      if (state.bleCharacteristic.properties.writeWithoutResponse) {
        await state.bleCharacteristic.writeValueWithoutResponse(chunk);
      } else {
        await state.bleCharacteristic.writeValue(chunk);
      }
    }
    return;
  }

  if (state.type === "usb") {
    if (!state.usbEndpoint) throw new Error("No USB printer connected");
    await state.device.transferOut(state.usbEndpoint.endpointNumber, bytes);
    return;
  }

  throw new Error("No thermal printer connected");
};
