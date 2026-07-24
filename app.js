"use strict";

const DEVICE_NAME = "PINZA-ESP32";
const SERVICE_UUID = "b7f10001-9c8d-4f3a-a6d5-8d2e937b2201";
const COMMAND_UUID = "b7f10002-9c8d-4f3a-a6d5-8d2e937b2201";
const STATUS_UUID = "b7f10003-9c8d-4f3a-a6d5-8d2e937b2201";

const HEARTBEAT_INTERVAL_MS = 250;

const connectButton = document.querySelector("#connectButton");
const holdButton = document.querySelector("#holdButton");
const connectionBadge = document.querySelector("#connectionBadge");
const gripperBadge = document.querySelector("#gripperBadge");
const deviceHint = document.querySelector("#deviceHint");
const statusMessage = document.querySelector("#statusMessage");
const browserWarning = document.querySelector("#browserWarning");

let bluetoothDevice = null;
let commandCharacteristic = null;
let statusCharacteristic = null;
let heartbeatTimer = null;
let isHolding = false;
let writeInProgress = false;
let queuedCommand = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function setStatus(message) {
  statusMessage.textContent = message;
}

function setConnectionState(connected) {
  connectionBadge.textContent = connected ? "Conectado" : "Desconectado";
  connectionBadge.className = `badge ${connected ? "badge-online" : "badge-offline"}`;
  holdButton.disabled = !connected;
  connectButton.textContent = connected ? "Desconectar" : "Conectar Bluetooth";

  if (!connected) {
    deviceHint.textContent = "Sin dispositivo conectado";
    setGripperState("OPEN");
  }
}

function setGripperState(state) {
  const normalized = String(state).trim().toUpperCase();
  const closed = normalized === "CLOSED";

  gripperBadge.textContent = closed ? "Cerrada" : "Abierta";
  gripperBadge.className = `badge ${closed ? "badge-closed" : "badge-open"}`;
}

function showBrowserCompatibility() {
  if (!window.isSecureContext) {
    browserWarning.textContent = "Esta página debe abrirse mediante HTTPS para usar Bluetooth.";
    browserWarning.classList.remove("hidden");
    connectButton.disabled = true;
    return false;
  }

  if (!("bluetooth" in navigator)) {
    browserWarning.textContent = "Este navegador no ofrece Web Bluetooth. Abre la página en Chrome o Edge desde un dispositivo compatible.";
    browserWarning.classList.remove("hidden");
    connectButton.disabled = true;
    return false;
  }

  browserWarning.classList.add("hidden");
  return true;
}

async function flushCommandQueue() {
  if (writeInProgress || !commandCharacteristic || !queuedCommand) {
    return;
  }

  writeInProgress = true;
  const command = queuedCommand;
  queuedCommand = null;

  try {
    await commandCharacteristic.writeValueWithoutResponse(encoder.encode(command));
  } catch (error) {
    console.error("Error al enviar comando BLE:", error);
    setStatus(`No se pudo enviar ${command}.`);
  } finally {
    writeInProgress = false;
    if (queuedCommand) {
      void flushCommandQueue();
    }
  }
}

function sendCommand(command) {
  if (!commandCharacteristic || !bluetoothDevice?.gatt?.connected) {
    return;
  }

  queuedCommand = command;
  void flushCommandQueue();
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function beginHold(event) {
  if (holdButton.disabled || isHolding || !bluetoothDevice?.gatt?.connected) {
    return;
  }

  event.preventDefault();
  isHolding = true;
  holdButton.classList.add("is-holding");
  holdButton.setPointerCapture?.(event.pointerId);

  setGripperState("CLOSED");
  setStatus("Cerrando mientras mantienes el botón presionado…");
  sendCommand("CLOSE");

  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (isHolding) {
      sendCommand("CLOSE");
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function endHold(event) {
  if (!isHolding) {
    return;
  }

  event?.preventDefault?.();
  isHolding = false;
  stopHeartbeat();
  holdButton.classList.remove("is-holding");

  setGripperState("OPEN");
  setStatus("Botón liberado. Abriendo la pinza…");
  sendCommand("OPEN");
}

function handleStatusNotification(event) {
  const value = decoder.decode(event.target.value);
  const normalized = value.trim().toUpperCase();

  if (normalized === "OPEN" || normalized === "CLOSED") {
    setGripperState(normalized);
    setStatus(normalized === "OPEN" ? "La ESP32 confirmó: pinza abierta." : "La ESP32 confirmó: pinza cerrada.");
    return;
  }

  if (normalized.startsWith("SAFETY_OPEN")) {
    isHolding = false;
    stopHeartbeat();
    holdButton.classList.remove("is-holding");
    setGripperState("OPEN");
    setStatus("Protección activada: la ESP32 abrió automáticamente la pinza.");
    return;
  }

  setStatus(`Estado recibido: ${value}`);
}

async function connectBluetooth() {
  if (!showBrowserCompatibility()) {
    return;
  }

  connectButton.disabled = true;
  setStatus("Buscando PINZA-ESP32…");

  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ name: DEVICE_NAME }],
      optionalServices: [SERVICE_UUID]
    });

    bluetoothDevice.addEventListener("gattserverdisconnected", handleDisconnected);

    setStatus("Conectando con la ESP32…");
    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    commandCharacteristic = await service.getCharacteristic(COMMAND_UUID);
    statusCharacteristic = await service.getCharacteristic(STATUS_UUID);

    await statusCharacteristic.startNotifications();
    statusCharacteristic.addEventListener("characteristicvaluechanged", handleStatusNotification);

    setConnectionState(true);
    deviceHint.textContent = bluetoothDevice.name || DEVICE_NAME;
    setStatus("Bluetooth conectado. La pinza está lista.");

    sendCommand("OPEN");
    window.setTimeout(() => sendCommand("STATUS"), 150);
  } catch (error) {
    console.error("No fue posible conectar:", error);

    if (error.name === "NotFoundError") {
      setStatus("Selección cancelada o dispositivo no encontrado.");
    } else {
      setStatus(`Error de conexión: ${error.message || error.name}`);
    }

    cleanConnectionReferences();
    setConnectionState(false);
  } finally {
    connectButton.disabled = false;
  }
}

function cleanConnectionReferences() {
  commandCharacteristic = null;
  statusCharacteristic = null;
  writeInProgress = false;
  queuedCommand = null;
}

function handleDisconnected() {
  isHolding = false;
  stopHeartbeat();
  holdButton.classList.remove("is-holding");
  cleanConnectionReferences();
  setConnectionState(false);
  setStatus("Bluetooth desconectado. La ESP32 debe abrir la pinza por seguridad.");
}

function disconnectBluetooth() {
  endHold();

  if (bluetoothDevice?.gatt?.connected) {
    window.setTimeout(() => bluetoothDevice.gatt.disconnect(), 100);
  } else {
    handleDisconnected();
  }
}

connectButton.addEventListener("click", () => {
  if (bluetoothDevice?.gatt?.connected) {
    disconnectBluetooth();
  } else {
    void connectBluetooth();
  }
});

holdButton.addEventListener("pointerdown", beginHold);
holdButton.addEventListener("pointerup", endHold);
holdButton.addEventListener("pointercancel", endHold);
holdButton.addEventListener("lostpointercapture", endHold);
holdButton.addEventListener("contextmenu", (event) => event.preventDefault());

window.addEventListener("pointerup", endHold);
window.addEventListener("blur", endHold);
window.addEventListener("pagehide", endHold);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    endHold();
  }
});

showBrowserCompatibility();
setConnectionState(false);
