/* eslint-disable no-unused-vars */
import { rpc } from '@cityofzion/neon-js';
import { RawData, WebSocket } from 'ws';
import { config } from '../config';

type NeoNotification = {
  available: Promise<boolean>,
  onCallback: Function,
  offCallback: Function,
  isOpen: Function,
  disconnect: Function,
};

const properties = config.getProperties();

const WS_NODE_URL: string = properties.wsNodeUrl;

async function disconnect(ws: WebSocket) {
  ws.close();
}

// Clients must wait for available() before calling
async function onCallback(
  ws: WebSocket,
  contractHash: string,
  eventName: string,
  callback: (this: WebSocket, data: RawData, isBinary: boolean) => void,
) {
  const subscribeQuery = new rpc.Query(
    {
      method: 'subscribe',
      params: ['notification_from_execution', { contract: contractHash, name: eventName }],
    },
  );
  ws.send(JSON.stringify(subscribeQuery.export()));
  ws.on('message', callback);
}

async function offCallback(
  ws: WebSocket,
  callback: (this: WebSocket, data: RawData, isBinary: boolean) => void,
) {
  ws.off('message', callback);
}

const initNotification = async () => {
  const ws = new WebSocket(WS_NODE_URL, {
    headers: {
      Origin: 'https://lyrebird.finance',
    },
  });
  let resolveAvailable: Function;

  const notificationAvailable = new Promise<boolean>((resolve, _) => {
    resolveAvailable = resolve;
  });

  ws.onopen = () => {
    resolveAvailable(true);
  };

  function registerCallback(
    contractHash: string,
    eventName: string,
    callback: (this: WebSocket, data: RawData, isBinary: boolean) => void,
  ) {
    onCallback(ws, contractHash, eventName, callback);
  }

  function unregisterCallback(
    callback: (this: WebSocket, data: RawData, isBinary: boolean) => void,
  ) {
    offCallback(ws, callback);
  }

  function isOpen() {
    return ws.readyState === WebSocket.OPEN;
  }

  const notificationImpl: NeoNotification = <NeoNotification>{
    available: notificationAvailable,
    onCallback: registerCallback,
    offCallback: unregisterCallback,
    isOpen,
    disconnect: () => disconnect(ws),
  };

  return notificationImpl;
};

function NeoNotificationInit(): Promise<NeoNotification> {
  return initNotification();
}

export type { NeoNotification };
export { NeoNotificationInit };
