/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Strip HTML tags from a string to produce safe plain text.
 *
 * Uses the browser's built-in DOMParser (no script execution) to
 * extract text content, which also decodes any HTML entities. Falls
 * back to a regex-based approach when DOMParser is not available
 * (e.g. server-side rendering or test environments without JSDOM).
 */
export default function sanitizeTitle(value: string): string {
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(value, 'text/html');
    return doc.body.textContent ?? '';
  }
  return value.replace(/<[^>]+>/g, '');
}
