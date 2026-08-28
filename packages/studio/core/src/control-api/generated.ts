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
            }
        },
        {
            "id": "project.setInstrumentProperties",
            "root": "project",
            "ownerType": "ProjectApi",
            "method": "setInstrumentProperties",
            "target": "singleton",
            "transaction": "editing",
            "async": false,
            "parameters": [
                {
                    "name": "instrument",
                    "optional": false,
                    "binding": {
                        "kind": "identifier",
                        "name": "instrument"
                    },
                    "type": {
                        "kind": "union",
                        "alternatives": [
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "VaporisateurDeviceBox"
                            },
                            {
                                "kind": "handle",
                                "handle": "box",
                                "name": "NeonDeviceBox"
                            }
                        ]
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
                            "name": "InstrumentPropertyChange",
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
            "description": "Set semantic instrument properties discovered with `daw_resources.inspect_instrument`.\nPaths are canonical instrument property paths, not raw field addresses. Multiple changes\nare applied together; use the returned paths exactly when making subsequent edits."
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
                        "kind": "handle",
                        "handle": "box",
                        "name": "PlayfieldDeviceBox"
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
            "description": "Assign a canonical sample to a Playfield slot.\nmidiNote is the absolute MIDI pitch and Playfield slot index in the range 0..127.\nNote events in the pattern must use the same MIDI pitch to trigger this sample."
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
                        "name": "SpielwerkDeviceBox"
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
                        "name": "WerkstattDeviceBox"
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
                                    "name": "SpielwerkDeviceBox"
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
                                    "name": "WerkstattDeviceBox"
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
                                "name": "SpielwerkDeviceBox"
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
                                "name": "WerkstattDeviceBox"
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
                                "name": "SpielwerkDeviceBox"
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
                                "name": "WerkstattDeviceBox"
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
            }
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
            }
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
            }
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
            }
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
            "description": "Create a note region on a TrackBox of type TrackType.Notes.\nWhen eventOwner is supplied, it may be a NoteRegionBox, NoteClipBox, or NoteEventCollectionBox;\nthe supplied owner's note-event collection is reused."
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
            }
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
            "description": "Create one note event in the owner's underlying note-event collection.\nPass the semantic owner box directly: the NoteRegionBox, NoteClipBox, or NoteEventCollectionBox itself;\ndo not pass an events field handle."
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
            "description": "Create note events in the owner's underlying note-event collection.\nPass the semantic owner box directly; do not pass an events field handle or field address.\nAll events are added to that owner."
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
            }
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
                                "name": "SpielwerkDeviceBox"
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
                                "name": "WerkstattDeviceBox"
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
            "id": "transport.sleep",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "sleep",
            "target": "singleton",
            "transaction": "none",
            "async": false,
            "parameters": [],
            "result": {
                "kind": "void"
            }
        },
        {
            "id": "transport.wake",
            "root": "transport",
            "ownerType": "EngineFacade",
            "method": "wake",
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
                ]
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
                ]
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
