/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'

import {fireEvent, render, screen} from '@testing-library/react'
import {describe, expect, it, vi} from 'vitest'

import type {JobRequirement} from '../agent-recipes'
import {JobConfigInputs} from './TemplateConfigInputs'

const URL_REQ: JobRequirement = {
  key: 'crash_log_source_url',
  kind: 'url',
  label: 'Crash log URL',
  placeholder: 'https://crash.example.com/yesterday.json',
}

const INT_REQ: JobRequirement = {
  defaultValue: 3,
  key: 'top_n',
  kind: 'positive_integer',
  label: 'Top N',
  placeholder: '3',
}

describe('JobConfigInputs', () => {
  it('renders nothing when requirements is empty', () => {
    const {container} = render(
      <JobConfigInputs
        allowlist={[]}
        onChange={vi.fn()}
        requirements={[]}
        values={{}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when only project_picker requirements (handled by dialog)', () => {
    const {container} = render(
      <JobConfigInputs
        allowlist={[]}
        onChange={vi.fn()}
        requirements={[
          {key: 'project', kind: 'project_picker', label: 'Project', placeholder: ''},
        ]}
        values={{}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a URL input + propagates onChange', () => {
    const onChange = vi.fn()
    render(
      <JobConfigInputs
        allowlist={[]}
        onChange={onChange}
        requirements={[URL_REQ]}
        values={{}}
      />,
    )

    const input = screen.getByTestId('job-config-crash_log_source_url') as HTMLInputElement
    fireEvent.change(input, {target: {value: 'https://example.com/yesterday.json'}})

    expect(onChange).toHaveBeenCalledWith(
      'crash_log_source_url',
      'https://example.com/yesterday.json',
    )
  })

  it('renders a positive-integer input and parses to number', () => {
    const onChange = vi.fn()
    render(
      <JobConfigInputs
        allowlist={[]}
        onChange={onChange}
        requirements={[INT_REQ]}
        values={{}}
      />,
    )

    const input = screen.getByTestId('job-config-top_n') as HTMLInputElement
    fireEvent.change(input, {target: {value: '7'}})

    expect(onChange).toHaveBeenCalledWith('top_n', 7)
  })

  it('hides the allowlist warning when the URL is invalid', () => {
    render(
      <JobConfigInputs
        allowlist={[{domainPattern: 'crash.example.com'}]}
        onChange={vi.fn()}
        requirements={[URL_REQ]}
        values={{crash_log_source_url: 'not-a-url'}}
      />,
    )
    expect(
      screen.queryByTestId('job-config-crash_log_source_url-allowlist-warning'),
    ).not.toBeInTheDocument()
  })

  it('renders the allowlist warning for a non-allowlisted hostname', () => {
    render(
      <JobConfigInputs
        allowlist={[{domainPattern: 'crash.example.com'}]}
        onChange={vi.fn()}
        requirements={[URL_REQ]}
        values={{crash_log_source_url: 'https://evil.example.com/log.json'}}
      />,
    )
    const warning = screen.getByTestId(
      'job-config-crash_log_source_url-allowlist-warning',
    )
    expect(warning).toBeInTheDocument()
    expect(warning.textContent).toContain('evil.example.com')
  })

  it('hides the allowlist warning when the hostname is allowlisted', () => {
    render(
      <JobConfigInputs
        allowlist={[{domainPattern: 'crash.example.com'}]}
        onChange={vi.fn()}
        requirements={[URL_REQ]}
        values={{crash_log_source_url: 'https://crash.example.com/log.json'}}
      />,
    )
    expect(
      screen.queryByTestId('job-config-crash_log_source_url-allowlist-warning'),
    ).not.toBeInTheDocument()
  })

  it('hides the allowlist warning when a wildcard pattern matches subdomain', () => {
    render(
      <JobConfigInputs
        allowlist={[{domainPattern: '*.zendesk.com'}]}
        onChange={vi.fn()}
        requirements={[URL_REQ]}
        values={{crash_log_source_url: 'https://support.zendesk.com/data.json'}}
      />,
    )
    expect(
      screen.queryByTestId('job-config-crash_log_source_url-allowlist-warning'),
    ).not.toBeInTheDocument()
  })
})
