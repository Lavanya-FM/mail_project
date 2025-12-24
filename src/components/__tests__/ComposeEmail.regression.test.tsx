import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import ComposeEmail from '../compose/ComposeEmail';
import { emailService } from '../../lib/emailService';
import { p2pService } from '../../lib/p2pService';
import { authService } from '../../lib/authService';

/* ===========================
   MOCKS
=========================== */

jest.mock('../../lib/emailService', () => ({
  emailService: {
    createEmail: jest.fn()
  }
}));

jest.mock('../../lib/p2pService', () => ({
  p2pService: {
    connect: jest.fn().mockResolvedValue(undefined),
    isPeerOnline: jest.fn(),
    sendStrictEmail: jest.fn()
  }
}));

jest.mock('../../lib/authService', () => ({
  authService: {
    getCurrentUser: jest.fn()
  }
}));

/* ===========================
   UTIL
=========================== */

function createMockFile(
  name: string,
  size: number,
  type = 'text/plain'
): File {
  const file = new File(['x'.repeat(size)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/* ===========================
   TESTS
=========================== */

describe('ComposeEmail – Attachment & P2P Regression Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (authService.getCurrentUser as jest.Mock).mockReturnValue({
      id: 1,
      email: 'sender@test.com',
      full_name: 'Sender'
    });

    (emailService.createEmail as jest.Mock).mockResolvedValue({
      id: 123,
      status: 'sent'
    });
  });

  test('ALWAYS persists attachments to server (no P2P)', async () => {
    (p2pService.isPeerOnline as jest.Mock).mockReturnValue(false);

    const { getByText, getByLabelText } = render(
      <ComposeEmail
        onClose={jest.fn()}
        onSent={jest.fn()}
        onDraftSaved={jest.fn()}
      />
    );

    fireEvent.change(getByLabelText(/to/i), {
      target: { value: 'receiver@test.com' }
    });

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const file = createMockFile('test.txt', 1024);
    fireEvent.change(fileInput, {
      target: { files: [file] }
    });

    fireEvent.click(getByText('Send'));

    await waitFor(() => {
      expect(emailService.createEmail).toHaveBeenCalledTimes(1);
    });

    const payload = (emailService.createEmail as jest.Mock).mock.calls[0][0];

    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0]).toMatchObject({
      filename: 'test.txt',
      encoding: 'base64'
    });
  });

  test('P2P send NEVER skips server persistence', async () => {
    (p2pService.isPeerOnline as jest.Mock).mockReturnValue(true);

    const { getByText, getByLabelText } = render(
      <ComposeEmail
        onClose={jest.fn()}
        onSent={jest.fn()}
        onDraftSaved={jest.fn()}
        isRecipientOnline={() => true}
      />
    );

    fireEvent.change(getByLabelText(/to/i), {
      target: { value: 'peer@test.com' }
    });

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    // Large file → forces P2P
    const largeFile = createMockFile(
      'large.bin',
      6 * 1024 * 1024
    );

    fireEvent.change(fileInput, {
      target: { files: [largeFile] }
    });

    fireEvent.click(getByText('Send'));

    await waitFor(() => {
      expect(p2pService.sendStrictEmail).toHaveBeenCalled();
      expect(emailService.createEmail).toHaveBeenCalled();
    });
  });

  test('P2P NEVER receives raw File[]', async () => {
    (p2pService.isPeerOnline as jest.Mock).mockReturnValue(true);

    const { getByText, getByLabelText } = render(
      <ComposeEmail
        onClose={jest.fn()}
        onSent={jest.fn()}
        onDraftSaved={jest.fn()}
        isRecipientOnline={() => true}
      />
    );

    fireEvent.change(getByLabelText(/to/i), {
      target: { value: 'peer@test.com' }
    });

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const largeFile = createMockFile(
      'huge.zip',
      10 * 1024 * 1024
    );

    fireEvent.change(fileInput, {
      target: { files: [largeFile] }
    });

    fireEvent.click(getByText('Send'));

    await waitFor(() => {
      expect(p2pService.sendStrictEmail).toHaveBeenCalled();
    });

    const p2pPayload =
      (p2pService.sendStrictEmail as jest.Mock).mock.calls[0][1];

    expect(Array.isArray(p2pPayload.attachments)).toBe(true);
    expect(p2pPayload.attachments[0]).not.toBeInstanceOf(File);
    expect(p2pPayload.attachments[0].encoding).toBe('base64');
  });

  test('Queued delivery still persists attachments', async () => {
    (p2pService.isPeerOnline as jest.Mock).mockReturnValue(false);

    (emailService.createEmail as jest.Mock).mockResolvedValue({
      status: 'queued'
    });

    const { getByText, getByLabelText } = render(
      <ComposeEmail
        onClose={jest.fn()}
        onSent={jest.fn()}
        onDraftSaved={jest.fn()}
      />
    );

    fireEvent.change(getByLabelText(/to/i), {
      target: { value: 'offline@test.com' }
    });

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;

    const file = createMockFile('offline.pdf', 2048);

    fireEvent.change(fileInput, {
      target: { files: [file] }
    });

    fireEvent.click(getByText('Send'));

    await waitFor(() => {
      expect(emailService.createEmail).toHaveBeenCalled();
    });

    const payload = (emailService.createEmail as jest.Mock).mock.calls[0][0];
    expect(payload.attachments).toHaveLength(1);
  });
});
