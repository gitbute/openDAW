// This file is generated. Do not edit manually.
import type {GeneratedManifest} from "./types"

export const generatedControlManifest: GeneratedManifest = {
    "operations": [
        {
            "id": "project.setBpm",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "setBpm",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "value",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "value"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createAnyInstrument",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAnyInstrument",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "factory",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "factory"
                    },
                    "type": {
                        "kind": "factory",
                        "factory": "instrument"
                    }
                }
            ],
            "result": {
                "kind": "object",
                "name": "InstrumentProduct",
                "properties": [
                    {
                        "name": "audioUnitBox",
                        "optional": false,
                        "type": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioUnitBox"
                        }
                    },
                    {
                        "name": "instrumentBox",
                        "optional": false,
                        "type": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ApparatDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "CubedDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "TapeDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "VaporisateurDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NeonDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NanoDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "PlayfieldDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "SoundfontDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MIDIOutputDeviceBox"
                                }
                            ]
                        }
                    },
                    {
                        "name": "trackBox",
                        "optional": false,
                        "type": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "TrackBox"
                        }
                    }
                ]
            },
            "description": "Create an instrument from a canonical factory."
        },
        {
            "id": "project.setDeviceProperties",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "setDeviceProperties",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "device",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "device"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "Box"
                    }
                },
                {
                    "name": "changes",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "changes"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "DevicePropertyChange",
                            "properties": [
                                {
                                    "name": "path",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "string"
                                    }
                                },
                                {
                                    "name": "value",
                                    "optional": false,
                                    "type": {
                                        "kind": "union",
                                        "alternatives": [
                                            {
                                                "kind": "literal",
                                                "values": [
                                                    null
                                                ]
                                            },
                                            {
                                                "kind": "primitive",
                                                "type": "string"
                                            },
                                            {
                                                "kind": "primitive",
                                                "type": "number"
                                            },
                                            {
                                                "kind": "primitive",
                                                "type": "boolean"
                                            },
                                            {
                                                "kind": "primitive",
                                                "type": "boolean"
                                            },
                                            {
                                                "kind": "handle",
                                                "handle": "address",
                                                "name": "Address"
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Set semantic properties on a supported device.\nPaths are stable semantic property paths rather than raw field addresses.\nMultiple changes are applied together by the caller's transaction."
        },
        {
            "id": "project.createAudioBus",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioBus",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "name",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "name"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                },
                {
                    "name": "type",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "type"
                    },
                    "type": {
                        "kind": "literal",
                        "values": [
                            "bus",
                            "aux"
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AudioBusBox"
            }
        },
        {
            "id": "project.routeOutput",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "routeOutput",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "nullable",
                        "value": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioBusBox"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createAuxSend",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAuxSend",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "targetBus",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "targetBus"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioBusBox"
                    }
                },
                {
                    "name": "sendGain",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "sendGain"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                },
                {
                    "name": "sendPan",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "sendPan"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                },
                {
                    "name": "routing",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "routing"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AuxSendBox"
            }
        },
        {
            "id": "project.deleteAuxSend",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteAuxSend",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "send",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "send"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AuxSendBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.assignNanoSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "assignNanoSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NanoDeviceBox"
                    }
                },
                {
                    "name": "sample",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "sample"
                    },
                    "type": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "bpm",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "custom",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "origin",
                                "optional": false,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        "openDAW",
                                        "recording",
                                        "import"
                                    ]
                                }
                            },
                            {
                                "name": "sample_rate",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "uuid",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Assign a canonical sample to the Nano instrument, which has no MIDI-note/sample-slot argument."
        },
        {
            "id": "project.assignPlayfieldSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "assignPlayfieldSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PlayfieldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioUnitBox"
                            }
                        ]
                    }
                },
                {
                    "name": "sample",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "sample"
                    },
                    "type": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "bpm",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "custom",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "origin",
                                "optional": false,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        "openDAW",
                                        "recording",
                                        "import"
                                    ]
                                }
                            },
                            {
                                "name": "sample_rate",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "uuid",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                },
                {
                    "name": "midiNote",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "midiNote"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Assign a canonical sample to a Playfield slot.\ntarget may be the PlayfieldDeviceBox itself or its containing AudioUnitBox returned by createAnyInstrument.\nmidiNote is the absolute MIDI pitch and Playfield slot index in the range 0..127.\nNote events in the pattern must use the same MIDI pitch to trigger this sample."
        },
        {
            "id": "project.removeNanoSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "removeNanoSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NanoDeviceBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Remove the sample assigned to a Nano instrument."
        },
        {
            "id": "project.removePlayfieldSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "removePlayfieldSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "PlayfieldDeviceBox"
                    }
                },
                {
                    "name": "midiNote",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "midiNote"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Remove the sample assigned to a Playfield absolute MIDI-note/sample slot."
        },
        {
            "id": "project.readApparatSource",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "readApparatSource",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ApparatDeviceBox"
                    }
                }
            ],
            "result": {
                "kind": "primitive",
                "type": "string"
            },
            "description": "Read an Apparat's user source without exposing the compiler's private version header."
        },
        {
            "id": "project.programApparat",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "programApparat",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ApparatDeviceBox"
                    }
                },
                {
                    "name": "source",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "source"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Compile and install JavaScript source for an Apparat instrument.\nProducer agents must read the live device's inspect_device_help programming contract before first\nprogramming it in a thread. A script can compile but later be silenced during rendering if\nprocess() throws, emits NaN, or emits an absolute sample amplitude above 1000; a successful\nsubsequent compile restores it."
        },
        {
            "id": "project.readWerkstattSource",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "readWerkstattSource",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WerkstattDeviceBox"
                    }
                }
            ],
            "result": {
                "kind": "primitive",
                "type": "string"
            },
            "description": "Read a Werkstatt's user source without exposing the compiler's private version header."
        },
        {
            "id": "project.programWerkstatt",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "programWerkstatt",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WerkstattDeviceBox"
                    }
                },
                {
                    "name": "source",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "source"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Compile and install JavaScript source for a Werkstatt audio effect. Producer agents must read the\nlive device's inspect_device_help programming contract before first programming it in a thread."
        },
        {
            "id": "project.readSpielwerkSource",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "readSpielwerkSource",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "SpielwerkDeviceBox"
                    }
                }
            ],
            "result": {
                "kind": "primitive",
                "type": "string"
            },
            "description": "Read a Spielwerk's user source without exposing the compiler's private version header."
        },
        {
            "id": "project.programSpielwerk",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "programSpielwerk",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "SpielwerkDeviceBox"
                    }
                },
                {
                    "name": "source",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "source"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Compile and install JavaScript source for a Spielwerk MIDI effect. Producer agents must read the\nlive device's inspect_device_help programming contract before first programming it in a thread."
        },
        {
            "id": "project.assignApparatSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "assignApparatSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ApparatDeviceBox"
                    }
                },
                {
                    "name": "sampleLabel",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "sampleLabel"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                },
                {
                    "name": "sample",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "sample"
                    },
                    "type": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "bpm",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "custom",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "origin",
                                "optional": false,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        "openDAW",
                                        "recording",
                                        "import"
                                    ]
                                }
                            },
                            {
                                "name": "sample_rate",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "uuid",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Assign a canonical sample to an existing Apparat"
        },
        {
            "id": "project.removeApparatSample",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "removeApparatSample",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ApparatDeviceBox"
                    }
                },
                {
                    "name": "sampleLabel",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "sampleLabel"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Remove an Apparat sample assignment while keeping its declared"
        },
        {
            "id": "project.insertEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "insertEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "field",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "field"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "EffectPointerType",
                        "constraintMembers": [
                            "Pointers.AudioEffectHost",
                            "Pointers.MIDIEffectHost"
                        ]
                    }
                },
                {
                    "name": "factory",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "factory"
                    },
                    "type": {
                        "kind": "factory",
                        "factory": "effect"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WerkstattDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "SpielwerkDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ArpeggioDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "PitchDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VelocityDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ZeitgeistDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownMidiEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MaximizerDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DelayDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RevampDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoToolDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TidalDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ModularDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownAudioEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CompressorDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "GateDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AutotuneDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ConvolverDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CrusherDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "FoldDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DattorroReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NeuralAmpDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VocoderDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WaveshaperDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioEffectCompositeBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoCompositeBox"
                    }
                ]
            }
        },
        {
            "id": "project.insertAudioEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "insertAudioEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "factory",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "factory"
                    },
                    "type": {
                        "kind": "factory",
                        "factory": "effect"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WerkstattDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "SpielwerkDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ArpeggioDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "PitchDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VelocityDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ZeitgeistDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownMidiEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MaximizerDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DelayDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RevampDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoToolDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TidalDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ModularDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownAudioEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CompressorDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "GateDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AutotuneDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ConvolverDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CrusherDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "FoldDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DattorroReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NeuralAmpDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VocoderDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WaveshaperDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioEffectCompositeBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoCompositeBox"
                    }
                ]
            },
            "description": "Insert an audio effect into an AudioUnit's canonical audio chain after reading its canonical help."
        },
        {
            "id": "project.insertMidiEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "insertMidiEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "factory",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "factory"
                    },
                    "type": {
                        "kind": "factory",
                        "factory": "effect"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WerkstattDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "SpielwerkDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ArpeggioDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "PitchDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VelocityDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ZeitgeistDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownMidiEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MaximizerDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DelayDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RevampDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoToolDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TidalDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ModularDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "UnknownAudioEffectDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CompressorDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "GateDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AutotuneDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ConvolverDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "CrusherDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "FoldDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "DattorroReverbDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NeuralAmpDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "VocoderDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "WaveshaperDeviceBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioEffectCompositeBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StereoCompositeBox"
                    }
                ]
            },
            "description": "Insert a MIDI effect into an AudioUnit's canonical MIDI chain after reading its canonical help."
        },
        {
            "id": "project.moveEffects",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "moveEffects",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "targetField",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "targetField"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "EffectPointerType",
                        "constraintMembers": [
                            "Pointers.AudioEffectHost",
                            "Pointers.MIDIEffectHost"
                        ]
                    }
                },
                {
                    "name": "boxes",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "boxes"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "WerkstattDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "SpielwerkDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ArpeggioDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "PitchDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "VelocityDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ZeitgeistDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "UnknownMidiEffectDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MaximizerDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "DelayDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ReverbDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RevampDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StereoToolDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "TidalDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ModularDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "UnknownAudioEffectDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "CompressorDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "GateDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "AutotuneDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "ConvolverDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "CrusherDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "FoldDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "DattorroReverbDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NeuralAmpDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "VocoderDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "WaveshaperDeviceBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "AudioEffectCompositeBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StereoCompositeBox"
                                }
                            ]
                        }
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "effect",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "effect"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WerkstattDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "SpielwerkDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ArpeggioDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PitchDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VelocityDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ZeitgeistDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownMidiEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MaximizerDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DelayDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RevampDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoToolDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "TidalDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ModularDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownAudioEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CompressorDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "GateDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AutotuneDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ConvolverDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CrusherDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "FoldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DattorroReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeuralAmpDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VocoderDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WaveshaperDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioEffectCompositeBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoCompositeBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.moveEffect",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "moveEffect",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "effect",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "effect"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WerkstattDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "SpielwerkDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ArpeggioDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PitchDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VelocityDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ZeitgeistDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownMidiEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MaximizerDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DelayDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RevampDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoToolDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "TidalDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ModularDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownAudioEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CompressorDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "GateDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AutotuneDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ConvolverDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CrusherDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "FoldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DattorroReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeuralAmpDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VocoderDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WaveshaperDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioEffectCompositeBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoCompositeBox"
                            }
                        ]
                    }
                },
                {
                    "name": "targetField",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "targetField"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "EffectPointerType",
                        "constraintMembers": [
                            "Pointers.AudioEffectHost",
                            "Pointers.MIDIEffectHost"
                        ]
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createNoteTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "TrackBox"
            }
        },
        {
            "id": "project.createAudioTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "TrackBox"
            }
        },
        {
            "id": "project.createAutomationTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAutomationTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.Automation",
                        "constraintMembers": [
                            "Pointers.Automation"
                        ]
                    }
                },
                {
                    "name": "insertIndex",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "insertIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "TrackBox"
            },
            "description": "Create a TrackType.Value timeline automation lane targeting the supplied automatable parameter field.\nThis is the normal parameter automation lane, not a ValueClip slot."
        },
        {
            "id": "project.compactTracks",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "compactTracks",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createNoteClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "clipIndex",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "clipIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "optional": true,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "name",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "name"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "hue"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteClipBox"
            },
            "description": "Create a note clip on a TrackBox of type TrackType.Notes with its own note-event collection."
        },
        {
            "id": "project.createAudioClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "audioFileBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioFileBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioFileBox"
                    }
                },
                {
                    "name": "clipIndex",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "clipIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "duration"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "name",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "name"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AudioClipBox"
            },
            "description": "Duration is expressed in openDAW musical pulses: 960 pulses are one quarter note, independent of BPM."
        },
        {
            "id": "project.createAudioRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAudioRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "audioFileBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioFileBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioFileBox"
                    }
                },
                {
                    "name": "position",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "duration"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "name",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "name"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "AudioRegionBox"
            },
            "description": "Position and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM."
        },
        {
            "id": "project.deleteTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.renameTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "renameTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "name",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "name"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.moveTrack",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "moveTrack",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "delta",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "delta"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "region",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "region"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ValueRegionBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "clip",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "clip"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ValueClipBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.duplicateTrackRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "duplicateTrackRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "region",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "region"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ValueRegionBox"
                            }
                        ]
                    }
                },
                {
                    "name": "position",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "object",
                        "name": "MusicalPosition",
                        "properties": [
                            {
                                "name": "bar",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "beat",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "sixteenth",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "ticks",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            }
                        ],
                        "description": "One-based musical position used by producer-facing control operations."
                    }
                },
                {
                    "name": "findFreeSpace",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "findFreeSpace"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "boolean"
                    }
                }
            ],
            "result": {
                "kind": "option",
                "value": {
                    "kind": "union",
                    "alternatives": [
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioRegionBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "NoteRegionBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "ValueRegionBox"
                        }
                    ]
                }
            },
            "description": "Duplicate a timeline region using the canonical overlap solver and optional musical position."
        },
        {
            "id": "project.quantiseNotes",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "quantiseNotes",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "notes",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "notes"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteEventCollectionBox"
                            },
                            {
                                "kind": "array",
                                "element": {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "NoteEventBox"
                                }
                            }
                        ]
                    }
                },
                {
                    "optional": false,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "positionQuantisation",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "positionQuantisation"
                                }
                            },
                            {
                                "name": "durationQuantisation",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "durationQuantisation"
                                }
                            },
                            {
                                "name": "offset",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "offset"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "QuantiseNotesOptions",
                        "properties": [
                            {
                                "name": "durationQuantisation",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "offset",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "positionQuantisation",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createValueClip",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createValueClip",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "clipIndex",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "clipIndex"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "optional": true,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "name",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "name"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "hue"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "ValueClipBox"
            },
            "description": "Create a ValueClip, a clip-slot style value sequence on a TrackType.Value track.\nThis is not the normal timeline automation region beneath a parameter or instrument track;\nuse createTrackRegion for that."
        },
        {
            "id": "project.createNoteRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "optional": false,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "trackBox",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "trackBox"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "position"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "duration"
                                }
                            },
                            {
                                "name": "loopOffset",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "loopOffset"
                                }
                            },
                            {
                                "name": "loopDuration",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "loopDuration"
                                }
                            },
                            {
                                "name": "eventOffset",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "eventOffset"
                                }
                            },
                            {
                                "name": "eventOwner",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "eventOwner"
                                }
                            },
                            {
                                "name": "mute",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "mute"
                                }
                            },
                            {
                                "name": "name",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "name"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "hue"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "NoteRegionParams",
                        "properties": [
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "eventOffset",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "eventOwner",
                                "optional": true,
                                "type": {
                                    "kind": "union",
                                    "alternatives": [
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteClipBox"
                                        },
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteRegionBox"
                                        },
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteEventCollectionBox"
                                        }
                                    ]
                                }
                            },
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "loopDuration",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "loopOffset",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "mute",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "trackBox",
                                "optional": false,
                                "type": {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "TrackBox"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteRegionBox"
            },
            "description": "Create a note region on a TrackBox of type TrackType.Notes.\nPosition and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.\nWhen eventOwner is supplied, it may be a NoteRegionBox, NoteClipBox, or NoteEventCollectionBox;\nthe supplied owner's note-event collection is reused."
        },
        {
            "id": "project.createMusicalNoteRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createMusicalNoteRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "position",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "object",
                        "name": "MusicalPosition",
                        "properties": [
                            {
                                "name": "bar",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "beat",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "sixteenth",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "ticks",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            }
                        ],
                        "description": "One-based musical position used by producer-facing control operations."
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "duration"
                    },
                    "type": {
                        "kind": "literal",
                        "values": [
                            "bar",
                            "whole",
                            "half",
                            "quarter",
                            "eighth",
                            "sixteenth",
                            "dotted-half",
                            "dotted-quarter",
                            "dotted-eighth",
                            "triplet-half",
                            "triplet-quarter",
                            "triplet-eighth"
                        ],
                        "description": "Named musical lengths resolved through the active project signature."
                    }
                },
                {
                    "optional": true,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "name",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "name"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "hue"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteRegionBox"
            },
            "description": "Create a note region using one-based musical bars/beats and a named\nmusical duration. Position and duration are resolved with the canonical\nPPQN/signature adapters; callers do not need to calculate pulses."
        },
        {
            "id": "project.createTrackRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createTrackRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "position",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "duration"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "optional": true,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "name",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "name"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "hue"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "option",
                "value": {
                    "kind": "union",
                    "alternatives": [
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "AudioRegionBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "NoteRegionBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "ValueRegionBox"
                        }
                    ]
                }
            },
            "description": "Create a region on a track. On a TrackType.Value track this creates the normal timeline\nValueRegionBox automation region and automatically seeds it with the initial held/current value.\nPosition and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM."
        },
        {
            "id": "project.createAutomationRegion",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createAutomationRegion",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "trackBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "TrackBox"
                    }
                },
                {
                    "name": "position",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "duration",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "duration"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "ValueEventInput",
                            "properties": [
                                {
                                    "name": "index",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "interpolation",
                                    "optional": true,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "none",
                                            "linear",
                                            "curve"
                                        ]
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "slope",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                },
                                {
                                    "name": "value",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                }
                            ]
                        }
                    }
                },
                {
                    "optional": true,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "name",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "name"
                                }
                            },
                            {
                                "name": "hue",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "hue"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "ClipRegionOptions",
                        "properties": [
                            {
                                "name": "hue",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "name",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "string"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "ValueRegionBox"
            },
            "description": "Create a timeline automation region on a TrackType.Value track and add its local value events.\nPosition and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.\nThe region is created through createTrackRegion, so its initial held/current value is preserved;\na supplied (0, 0) event updates that seed through the canonical value-event collection."
        },
        {
            "id": "project.createNoteEvent",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteEvent",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "optional": false,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "owner",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "owner"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "position"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "duration"
                                }
                            },
                            {
                                "name": "velocity",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "velocity"
                                }
                            },
                            {
                                "name": "pitch",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "pitch"
                                }
                            },
                            {
                                "name": "chance",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "chance"
                                }
                            },
                            {
                                "name": "cent",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "cent"
                                }
                            },
                            {
                                "name": "playCount",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "playCount"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "NoteEventParams",
                        "properties": [
                            {
                                "name": "cent",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "chance",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "owner",
                                "optional": false,
                                "type": {
                                    "kind": "union",
                                    "alternatives": [
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteClipBox"
                                        },
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteRegionBox"
                                        },
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteEventCollectionBox"
                                        }
                                    ]
                                }
                            },
                            {
                                "name": "pitch",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "playCount",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "ppqn"
                                }
                            },
                            {
                                "name": "velocity",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "float"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteEventBox"
            },
            "description": "Create one note event in the owner's underlying note-event collection.\nPosition and duration are openDAW musical pulses: 960 pulses are one quarter note, independent of BPM.\nPass the semantic owner box directly: the NoteRegionBox, NoteClipBox, or NoteEventCollectionBox itself;\ndo not pass an events field handle."
        },
        {
            "id": "project.createNoteEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createNoteEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "owner",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "owner"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteEventCollectionBox"
                            }
                        ]
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "NoteEventInput",
                            "properties": [
                                {
                                    "name": "cent",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number"
                                    }
                                },
                                {
                                    "name": "chance",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "duration",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "pitch",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "playCount",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "velocity",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "float"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "box",
                    "name": "NoteEventBox"
                }
            },
            "description": "Create note events in the owner's underlying note-event collection.\nEach position and duration is expressed in openDAW musical pulses: 960 pulses are one quarter note,\nindependent of BPM.\nPass the semantic owner box directly; do not pass an events field handle or field address.\nAll events are added to that owner."
        },
        {
            "id": "project.createMusicalNoteEvent",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createMusicalNoteEvent",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "optional": false,
                    "binding": {
                        "kind": "object",
                        "properties": [
                            {
                                "name": "owner",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "owner"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "position"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "duration"
                                }
                            },
                            {
                                "name": "velocity",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "velocity"
                                }
                            },
                            {
                                "name": "pitch",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "pitch"
                                }
                            },
                            {
                                "name": "chance",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "chance"
                                }
                            },
                            {
                                "name": "cent",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "cent"
                                }
                            },
                            {
                                "name": "playCount",
                                "optional": false,
                                "binding": {
                                    "kind": "identifier",
                                    "name": "playCount"
                                }
                            }
                        ]
                    },
                    "type": {
                        "kind": "object",
                        "name": "MusicalNoteEventParams",
                        "properties": [
                            {
                                "name": "cent",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number"
                                }
                            },
                            {
                                "name": "chance",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "duration",
                                "optional": false,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        "bar",
                                        "whole",
                                        "half",
                                        "quarter",
                                        "eighth",
                                        "sixteenth",
                                        "dotted-half",
                                        "dotted-quarter",
                                        "dotted-eighth",
                                        "triplet-half",
                                        "triplet-quarter",
                                        "triplet-eighth"
                                    ],
                                    "description": "Named musical lengths resolved through the active project signature."
                                }
                            },
                            {
                                "name": "owner",
                                "optional": false,
                                "type": {
                                    "kind": "union",
                                    "alternatives": [
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteClipBox"
                                        },
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteRegionBox"
                                        },
                                        {
                                            "kind": "handle",
                                            "handle": "box",
                                            "name": "NoteEventCollectionBox"
                                        }
                                    ]
                                }
                            },
                            {
                                "name": "pitch",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "playCount",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "position",
                                "optional": false,
                                "type": {
                                    "kind": "object",
                                    "name": "MusicalPosition",
                                    "properties": [
                                        {
                                            "name": "bar",
                                            "optional": false,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "number",
                                                "semantic": "int"
                                            }
                                        },
                                        {
                                            "name": "beat",
                                            "optional": true,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "number",
                                                "semantic": "int"
                                            }
                                        },
                                        {
                                            "name": "sixteenth",
                                            "optional": true,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "number",
                                                "semantic": "int"
                                            }
                                        },
                                        {
                                            "name": "ticks",
                                            "optional": true,
                                            "type": {
                                                "kind": "primitive",
                                                "type": "number",
                                                "semantic": "int"
                                            }
                                        }
                                    ],
                                    "description": "One-based musical position used by producer-facing control operations."
                                }
                            },
                            {
                                "name": "velocity",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "float"
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "NoteEventBox"
            },
            "description": "Create one note event from a one-based musical position and named\nduration. The position is relative to the owner's note collection; bar\n1, beat 1 is the collection start. Signature changes use the active\nproject signature at that owner. Pass the semantic owner box directly:\nthe NoteRegionBox, NoteClipBox, or NoteEventCollectionBox itself; do not\npass an events field handle."
        },
        {
            "id": "project.createMusicalNoteEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createMusicalNoteEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "owner",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "owner"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteEventCollectionBox"
                            }
                        ]
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "MusicalNoteEventInput",
                            "properties": [
                                {
                                    "name": "cent",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number"
                                    }
                                },
                                {
                                    "name": "chance",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "duration",
                                    "optional": false,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "bar",
                                            "whole",
                                            "half",
                                            "quarter",
                                            "eighth",
                                            "sixteenth",
                                            "dotted-half",
                                            "dotted-quarter",
                                            "dotted-eighth",
                                            "triplet-half",
                                            "triplet-quarter",
                                            "triplet-eighth"
                                        ],
                                        "description": "Named musical lengths resolved through the active project signature."
                                    }
                                },
                                {
                                    "name": "pitch",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "playCount",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "object",
                                        "name": "MusicalPosition",
                                        "properties": [
                                            {
                                                "name": "bar",
                                                "optional": false,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            },
                                            {
                                                "name": "beat",
                                                "optional": true,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            },
                                            {
                                                "name": "sixteenth",
                                                "optional": true,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            },
                                            {
                                                "name": "ticks",
                                                "optional": true,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            }
                                        ],
                                        "description": "One-based musical position used by producer-facing control operations."
                                    }
                                },
                                {
                                    "name": "velocity",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "float"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "box",
                    "name": "NoteEventBox"
                }
            },
            "description": "Create note events from one-based musical positions and named durations.\nPositions are relative to the owner's note collection, so a regular\nfour-on-the-floor pattern uses beats 1, 2, 3, and 4 directly. Pass the\nsemantic owner box directly; do not pass an events field handle."
        },
        {
            "id": "project.updateMusicalNoteEvent",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "updateMusicalNoteEvent",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "event",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "event"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "NoteEventBox"
                    }
                },
                {
                    "name": "position",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "object",
                        "name": "MusicalPosition",
                        "properties": [
                            {
                                "name": "bar",
                                "optional": false,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "beat",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "sixteenth",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "ticks",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            }
                        ],
                        "description": "One-based musical position used by producer-facing control operations."
                    }
                },
                {
                    "name": "duration",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "duration"
                    },
                    "type": {
                        "kind": "literal",
                        "values": [
                            "bar",
                            "whole",
                            "half",
                            "quarter",
                            "eighth",
                            "sixteenth",
                            "dotted-half",
                            "dotted-quarter",
                            "dotted-eighth",
                            "triplet-half",
                            "triplet-quarter",
                            "triplet-eighth"
                        ]
                    }
                },
                {
                    "name": "pitch",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "pitch"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "cent",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "cent"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number"
                    }
                },
                {
                    "name": "velocity",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "velocity"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "float"
                    }
                },
                {
                    "name": "chance",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "chance"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "playCount",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "playCount"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                }
            ],
            "result": {
                "kind": "void"
            },
            "description": "Update only the supplied properties of a note using one-based musical coordinates."
        },
        {
            "id": "project.replaceMusicalNoteEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "replaceMusicalNoteEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "owner",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "owner"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteClipBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteRegionBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NoteEventCollectionBox"
                            }
                        ]
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "MusicalNoteEventInput",
                            "properties": [
                                {
                                    "name": "cent",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number"
                                    }
                                },
                                {
                                    "name": "chance",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "duration",
                                    "optional": false,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "bar",
                                            "whole",
                                            "half",
                                            "quarter",
                                            "eighth",
                                            "sixteenth",
                                            "dotted-half",
                                            "dotted-quarter",
                                            "dotted-eighth",
                                            "triplet-half",
                                            "triplet-quarter",
                                            "triplet-eighth"
                                        ],
                                        "description": "Named musical lengths resolved through the active project signature."
                                    }
                                },
                                {
                                    "name": "pitch",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "playCount",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "object",
                                        "name": "MusicalPosition",
                                        "properties": [
                                            {
                                                "name": "bar",
                                                "optional": false,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            },
                                            {
                                                "name": "beat",
                                                "optional": true,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            },
                                            {
                                                "name": "sixteenth",
                                                "optional": true,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            },
                                            {
                                                "name": "ticks",
                                                "optional": true,
                                                "type": {
                                                    "kind": "primitive",
                                                    "type": "number",
                                                    "semantic": "int"
                                                }
                                            }
                                        ],
                                        "description": "One-based musical position used by producer-facing control operations."
                                    }
                                },
                                {
                                    "name": "velocity",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "float"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "box",
                    "name": "NoteEventBox"
                }
            },
            "description": "Replace one owner's note pattern through the existing musical-event creation path."
        },
        {
            "id": "project.deleteNoteEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteNoteEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "NoteEventBox"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.createValueEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "createValueEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "collection",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "collection"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.ValueEventCollection",
                        "constraintMembers": [
                            "Pointers.ValueEventCollection"
                        ]
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "ValueEventInput",
                            "properties": [
                                {
                                    "name": "index",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "interpolation",
                                    "optional": true,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "none",
                                            "linear",
                                            "curve"
                                        ]
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "slope",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                },
                                {
                                    "name": "value",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "box",
                    "name": "ValueEventBox"
                }
            },
            "description": "Create or update value events in a ValueRegionBox or ValueClipBox event collection.\nPositions are local to the owning collection, and (position, index) identifies ordering.\nAn existing pair is updated through the canonical collection adapter instead of duplicated."
        },
        {
            "id": "project.replaceValueEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "replaceValueEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "collection",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "collection"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.ValueEventCollection",
                        "constraintMembers": [
                            "Pointers.ValueEventCollection"
                        ]
                    }
                },
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "object",
                            "name": "ValueEventInput",
                            "properties": [
                                {
                                    "name": "index",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "int"
                                    }
                                },
                                {
                                    "name": "interpolation",
                                    "optional": true,
                                    "type": {
                                        "kind": "literal",
                                        "values": [
                                            "none",
                                            "linear",
                                            "curve"
                                        ]
                                    }
                                },
                                {
                                    "name": "position",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "ppqn"
                                    }
                                },
                                {
                                    "name": "slope",
                                    "optional": true,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                },
                                {
                                    "name": "value",
                                    "optional": false,
                                    "type": {
                                        "kind": "primitive",
                                        "type": "number",
                                        "semantic": "unitValue"
                                    }
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.updateValueEvent",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "updateValueEvent",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "event",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "event"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "ValueEventBox"
                    }
                },
                {
                    "name": "position",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                },
                {
                    "name": "index",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "index"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "int"
                    }
                },
                {
                    "name": "value",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "value"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                },
                {
                    "name": "interpolation",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "interpolation"
                    },
                    "type": {
                        "kind": "literal",
                        "values": [
                            "none",
                            "linear",
                            "curve"
                        ]
                    }
                },
                {
                    "name": "slope",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "slope"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteValueEvents",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteValueEvents",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "events",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "events"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "handle",
                            "handle": "box",
                            "name": "ValueEventBox"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.applyPreset",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "applyPreset",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioUnitBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WerkstattDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "SpielwerkDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ArpeggioDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "PitchDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VelocityDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ZeitgeistDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownMidiEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MaximizerDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DelayDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RevampDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoToolDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "TidalDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ModularDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "UnknownAudioEffectDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CompressorDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "GateDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AutotuneDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "ConvolverDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "CrusherDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "FoldDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "DattorroReverbDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeuralAmpDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VocoderDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "WaveshaperDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "AudioEffectCompositeBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StereoCompositeBox"
                            }
                        ]
                    }
                },
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "uuid"
                    },
                    "type": {
                        "kind": "uuid"
                    }
                },
                {
                    "name": "options",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "options"
                    },
                    "type": {
                        "kind": "object",
                        "name": "PresetApplyOptions",
                        "properties": [
                            {
                                "name": "insertIndex",
                                "optional": true,
                                "type": {
                                    "kind": "primitive",
                                    "type": "number",
                                    "semantic": "int"
                                }
                            },
                            {
                                "name": "keepAudioEffects",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "keepMIDIEffects",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "keepTimeline",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        false,
                                        true
                                    ]
                                }
                            },
                            {
                                "name": "source",
                                "optional": true,
                                "type": {
                                    "kind": "literal",
                                    "values": [
                                        "stock",
                                        "user"
                                    ]
                                }
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.deleteAudioUnit",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "deleteAudioUnit",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "audioUnitBox",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "audioUnitBox"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "box",
                        "name": "AudioUnitBox"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.duplicateNotes",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "duplicateNotes",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "notes",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "notes"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "handle",
                            "handle": "adapter",
                            "name": "NoteEventBoxAdapter"
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "adapter",
                    "name": "NoteEventBoxAdapter"
                }
            },
            "description": "Duplicate a set of notes so that the copies land flush after the\r\nsource block: each copy is shifted by `max(position + duration) −\r\nmin(position)` over the input. Returns the newly created note\r\nadapters in the same order as `notes`, so the caller can swap its\r\nselection in one pass. Returns an empty array when the input is\r\nempty or the computed shift is zero. The caller is responsible for\r\nwrapping the call in `editing.modify(...)`."
        },
        {
            "id": "project.modulation.adapters",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "adapters",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "handle",
                    "handle": "adapter",
                    "name": "ModulatorBoxAdapter"
                }
            }
        },
        {
            "id": "project.modulation.createLfo",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createLfo",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "label"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.createSteps",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createSteps",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "label"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.createMacro",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createMacro",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "label"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.createRandom",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "createRandom",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "label",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "label"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.assign",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "assign",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulator",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "modulator"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "handle",
                        "handle": "field",
                        "name": "Field",
                        "constraint": "Pointers.Modulation",
                        "constraintMembers": [
                            "Pointers.Modulation"
                        ]
                    }
                },
                {
                    "name": "depth",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "depth"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                }
            ],
            "result": {
                "kind": "handle",
                "handle": "box",
                "name": "ModulationBox"
            }
        },
        {
            "id": "project.modulation.duplicate",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "duplicate",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulator",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "modulator"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "union",
                "alternatives": [
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "LfoModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "StepsModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "MacroModulatorBox"
                    },
                    {
                        "kind": "handle",
                        "handle": "box",
                        "name": "RandomModulatorBox"
                    }
                ]
            }
        },
        {
            "id": "project.modulation.duplicateAll",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "duplicateAll",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulators",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "modulators"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "LfoModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StepsModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MacroModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RandomModulatorBox"
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "array",
                "element": {
                    "kind": "union",
                    "alternatives": [
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "LfoModulatorBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "StepsModulatorBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "MacroModulatorBox"
                        },
                        {
                            "kind": "handle",
                            "handle": "box",
                            "name": "RandomModulatorBox"
                        }
                    ]
                }
            }
        },
        {
            "id": "project.modulation.delete",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "delete",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulator",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "modulator"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.modulation.deleteAll",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "deleteAll",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulators",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "modulators"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "LfoModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StepsModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MacroModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RandomModulatorBox"
                                }
                            ]
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "project.modulation.move",
            "root": "modulation",
            "ownerType": "ProjectModulation",
            "method": "move",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "modulators",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "modulators"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "union",
                            "alternatives": [
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "LfoModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "StepsModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "MacroModulatorBox"
                                },
                                {
                                    "kind": "handle",
                                    "handle": "box",
                                    "name": "RandomModulatorBox"
                                }
                            ]
                        }
                    }
                },
                {
                    "name": "target",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "target"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "LfoModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "StepsModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "MacroModulatorBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "RandomModulatorBox"
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.play",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "play",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.stop",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "stop",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "reset",
                    "optional": true,
                    "binding": {
                        "kind": "identifier",
                        "name": "reset"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "boolean"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.setPosition",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "setPosition",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "position",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.prepareRecordingState",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "prepareRecordingState",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "countIn",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "countIn"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "boolean"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.stopRecording",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "stopRecording",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.isReady",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "isReady",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.queryLoadingComplete",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "queryLoadingComplete",
            "target": "singleton",
            "transaction": "none",
            "async": true,
            "parameters": [],
            "result": {
                "kind": "primitive",
                "type": "boolean"
            }
        },
        {
            "id": "transport.panic",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "panic",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.ignoreNoteRegion",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "ignoreNoteRegion",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "uuid"
                    },
                    "type": {
                        "kind": "uuid"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.suspendAutomation",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "suspendAutomation",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "uuid"
                    },
                    "type": {
                        "kind": "uuid"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.noteSignal",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "noteSignal",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "signal",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "signal"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "object",
                                "name": "NoteSignalOn",
                                "properties": [
                                    {
                                        "name": "pitch",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "byte"
                                        }
                                    },
                                    {
                                        "name": "type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "uuid",
                                        "optional": false,
                                        "type": {
                                            "kind": "uuid"
                                        }
                                    },
                                    {
                                        "name": "velocity",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "unitValue"
                                        }
                                    }
                                ]
                            },
                            {
                                "kind": "object",
                                "name": "NoteSignalOff",
                                "properties": [
                                    {
                                        "name": "pitch",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "byte"
                                        }
                                    },
                                    {
                                        "name": "type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "uuid",
                                        "optional": false,
                                        "type": {
                                            "kind": "uuid"
                                        }
                                    }
                                ]
                            },
                            {
                                "kind": "object",
                                "name": "NoteSignalAudition",
                                "properties": [
                                    {
                                        "name": "duration",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "ppqn"
                                        }
                                    },
                                    {
                                        "name": "pitch",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "byte"
                                        }
                                    },
                                    {
                                        "name": "type",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "string"
                                        }
                                    },
                                    {
                                        "name": "uuid",
                                        "optional": false,
                                        "type": {
                                            "kind": "uuid"
                                        }
                                    },
                                    {
                                        "name": "velocity",
                                        "optional": false,
                                        "type": {
                                            "kind": "primitive",
                                            "type": "number",
                                            "semantic": "unitValue"
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.scheduleClipPlay",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "scheduleClipPlay",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "clipIds",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "clipIds"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "uuid"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.scheduleClipStop",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "scheduleClipStop",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "trackIds",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "trackIds"
                    },
                    "type": {
                        "kind": "array",
                        "element": {
                            "kind": "uuid"
                        }
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.unregisterMonitoringSource",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "unregisterMonitoringSource",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [
                {
                    "name": "uuid",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "uuid"
                    },
                    "type": {
                        "kind": "uuid"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.valueAt",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "valueAt",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "position",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "position"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "ppqn"
                    }
                }
            ],
            "result": {
                "kind": "parameterValue"
            }
        },
        {
            "id": "parameter.notifyPrinting",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "notifyPrinting",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.getValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "parameterValue"
            }
        },
        {
            "id": "parameter.setValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "setValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "value",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "value"
                    },
                    "type": {
                        "kind": "parameterValue"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.setUnitValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "setUnitValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "value",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "value"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "number",
                        "semantic": "unitValue"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.getUnitValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getUnitValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "primitive",
                "type": "number",
                "semantic": "unitValue"
            }
        },
        {
            "id": "parameter.getControlledValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getControlledValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "parameterValue"
            }
        },
        {
            "id": "parameter.getControlledUnitValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getControlledUnitValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "primitive",
                "type": "number",
                "semantic": "unitValue"
            }
        },
        {
            "id": "parameter.getControlledPrintValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getControlledPrintValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "object",
                "name": "Readonly",
                "properties": [
                    {
                        "name": "unit",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    },
                    {
                        "name": "value",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    }
                ],
                "description": "Make all properties in T readonly"
            }
        },
        {
            "id": "parameter.getPrintValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "getPrintValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "object",
                "name": "Readonly",
                "properties": [
                    {
                        "name": "unit",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    },
                    {
                        "name": "value",
                        "optional": false,
                        "type": {
                            "kind": "primitive",
                            "type": "string"
                        }
                    }
                ],
                "description": "Make all properties in T readonly"
            }
        },
        {
            "id": "parameter.setPrintValue",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "setPrintValue",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "text",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "text"
                    },
                    "type": {
                        "kind": "primitive",
                        "type": "string"
                    }
                }
            ],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "parameter.reset",
            "root": "parameter",
            "ownerType": "AutomatableParameterFieldAdapter",
            "method": "reset",
            "target": "address",
            "transaction": "editing",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        }
    ],
    "skipped": [
        {
            "root": "ProjectApi",
            "method": "catchupAndSubscribeBpm",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "ProjectApi",
            "method": "catchupAndSubscribeAudioUnits",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "ProjectApi",
            "method": "createInstrument",
            "reason": "generic method signature is not instantiated"
        },
        {
            "root": "ProjectApi",
            "method": "replaceMIDIInstrument",
            "reason": "generic method signature is not instantiated"
        },
        {
            "root": "ProjectApi",
            "method": "duplicateRegion",
            "reason": "generic method signature is not instantiated"
        },
        {
            "root": "ProjectModulation",
            "method": "create",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "ProjectModulation",
            "method": "replace",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "setWorklet",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "EngineFacade",
            "method": "assertWorklet",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "EngineFacade",
            "method": "releaseWorklet",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "EngineFacade",
            "method": "sleep",
            "reason": "engine lifecycle/power method is not producer-facing"
        },
        {
            "root": "EngineFacade",
            "method": "wake",
            "reason": "engine lifecycle/power method is not producer-facing"
        },
        {
            "root": "EngineFacade",
            "method": "subscribeClipNotification",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "subscribeNotes",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "subscribeDeviceMessage",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "registerMonitoringSource",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "EngineFacade",
            "method": "terminate",
            "reason": "lifecycle/worklet infrastructure method"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "registerMidiControl",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "catchupAndSubscribeName",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "registerTracks",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "subscribe",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "catchupAndSubscribe",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "catchupAndSubscribeControlSources",
            "reason": "callback, listener, subscription, or function type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "terminate",
            "reason": "lifecycle/worklet infrastructure method"
        }
    ],
    "unsupported": [
        {
            "root": "ProjectApi",
            "method": "createTimeStretchedClip",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createTimeStretchedRegion",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createPitchStretchedClip",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createPitchStretchedRegion",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createNotStretchedClip",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "createNotStretchedRegion",
            "reason": "BoxGraph<any>: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "exportMIDI",
            "reason": "RejectedResult: unrecognised class/resource type"
        },
        {
            "root": "ProjectApi",
            "method": "exportAudio",
            "reason": "RejectedResult: unrecognised class/resource type"
        },
        {
            "root": "EngineFacade",
            "method": "loadClickSound",
            "reason": "() => ArrayIterator<number>: function/constructor type"
        },
        {
            "root": "EngineFacade",
            "method": "setFrozenAudio",
            "reason": "() => ArrayIterator<number>: function/constructor type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "optTracks",
            "reason": "(listener: IndexedAdapterCollectionListener<TrackBoxAdapter>) => Terminable: function/constructor type"
        },
        {
            "root": "AutomatableParameterFieldAdapter",
            "method": "updateMappings",
            "reason": "(y: T) => T: function/constructor type"
        }
    ]
}
