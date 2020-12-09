/**
 * Copyright 2019, OpenCensus Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as exportersTypes from '../exporters/types';
import * as configTypes from './config/types';
import * as modelTypes from './model/types';
/** Main interface for tracing. */
export interface Tracing {
    /** Object responsible for managing a trace. */
    readonly tracer: modelTypes.TracerBase;
    /** Service to send collected traces to. */
    readonly exporter: exportersTypes.Exporter;
    /** Gets active status  */
    active: boolean;
    /**
     * Starts tracing.
     * @param userConfig A configuration object to start tracing.
     * @returns The started Tracing instance.
     */
    start(userConfig?: configTypes.Config): Tracing;
    /** Stops tracing. */
    stop(): void;
    /**
     * Registers an exporter to send the collected traces to.
     * @param exporter The exporter to send the traces to.
     * @returns The tracing object.
     */
    registerExporter(exporter: exportersTypes.Exporter): Tracing;
    /**
     * Unregisters an exporter.
     * @param exporter The exporter to stop sending traces to.
     */
    unregisterExporter(exporter: exportersTypes.Exporter): Tracing;
}
