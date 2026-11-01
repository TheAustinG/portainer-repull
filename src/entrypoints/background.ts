import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { handleRedeploy, isRedeployRequest } from '@/redeploy-handler';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isRedeployRequest(message)) return undefined;
    void handleRedeploy(message).then(sendResponse);
    return true;
  });
});
