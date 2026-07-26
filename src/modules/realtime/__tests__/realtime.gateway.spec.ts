import { RealtimeGateway } from '../realtime.gateway';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });

  beforeEach(() => {
    gateway = new RealtimeGateway();
    gateway.server = { to: mockTo } as any;
    jest.clearAllMocks();
  });

  it('broadcasts message:new to the conversation room', () => {
    const payload = { id: 'message-uuid', content: 'Hello' };

    gateway.emitMessage('conversation-uuid', payload);

    expect(mockTo).toHaveBeenCalledWith('conversation-uuid');
    expect(mockEmit).toHaveBeenCalledWith('message:new', payload);
  });
});
