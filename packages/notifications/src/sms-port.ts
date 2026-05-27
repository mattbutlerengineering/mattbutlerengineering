export interface SmsPort {
  sendSms(to: string, body: string): Promise<void>;
}
