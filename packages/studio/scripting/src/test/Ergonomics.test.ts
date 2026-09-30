import {describe, expect, expectTypeOf, it} from "vitest"
import {dbToGain, PPQN} from "@opendaw/lib-dsp"
import {createFixture} from "./Fixture"
import {Apparat, AuxAudioUnit, GroupAudioUnit, InstrumentAudioUnit, Nano, Vaporisateur} from "../Api"

describe("Typed unit lookups", () => {
    it("finds units by label and kind", () => {
        const {project} = createFixture()
        const lead = project.addInstrumentUnit("Vaporisateur", {label: "Lead"})
        const reverb = project.addAuxUnit({label: "Reverb"})
        const drums = project.addGroupUnit({label: "Drums"})
        expect(project.findAudioUnit("Lead")).toBe(lead)
        expect(project.findAudioUnit("Lead", "instrument")).toBe(lead)
        expect(project.findAudioUnit("Lead", "auxiliary")).toBeNull()
        expect(project.findAudioUnit("Reverb", "auxiliary")).toBe(reverb)
        expect(project.findAudioUnit("Missing", "group")).toBeNull()
        expect(() => project.findAudioUnit("Lead", "bus" as "group")).toThrow(RangeError)
        expect(project.findInstrumentUnit("Lead")).toBe(lead)
        expect(project.findInstrumentUnit("Lead", "Vaporisateur")).toBe(lead)
        expect(project.findInstrumentUnit("Lead", "Nano")).toBeNull()
        expect(project.findInstrumentUnit("Reverb")).toBeNull()
        expect(project.findAuxUnit("Reverb")).toBe(reverb)
        expect(project.findAuxUnit("Drums")).toBeNull()
        expect(project.findGroupUnit("Drums")).toBe(drums)
        expect(project.findGroupUnit("Lead")).toBeNull()
    })

    it("types lookups precisely", () => {
        const {project} = createFixture()
        project.addInstrumentUnit("Vaporisateur", {label: "Lead"})
        const reverb = project.addAuxUnit({label: "Reverb"})
        project.addGroupUnit({label: "Drums"})
        const lead = project.findInstrumentUnit("Lead", "Vaporisateur")
        expectTypeOf(lead).toEqualTypeOf<InstrumentAudioUnit<"Vaporisateur"> | null>()
        if (lead === null) {throw new Error("Lead not found")}
        lead.instrument.cutoff = 1200
        expect(lead.instrument.cutoff).toBe(1200)
        const bus = project.findGroupUnit("Drums")
        expectTypeOf(bus).toEqualTypeOf<GroupAudioUnit | null>()
        bus?.addSend(reverb, {amount: -12})
        expect(bus?.sends.length).toBe(1)
        expectTypeOf(project.findAuxUnit("Reverb")).toEqualTypeOf<AuxAudioUnit | null>()
        expectTypeOf(project.findAudioUnit("Reverb", "auxiliary")).toEqualTypeOf<AuxAudioUnit | null>()
        const any = project.findAudioUnit("Lead")
        // @ts-expect-error the union includes the output unit, which has no sends
        any?.addSend(reverb)
        // @ts-expect-error the union includes bus units, which have no instrument
        any?.setInstrument("Nano")
    })

    it("narrows the instrument with hasInstrument and types setInstrument", () => {
        const {project} = createFixture()
        const unit: InstrumentAudioUnit = project.addInstrumentUnit("Vaporisateur")
        expect(unit.hasInstrument("Vaporisateur")).toBe(true)
        expect(unit.hasInstrument("Nano")).toBe(false)
        if (unit.hasInstrument("Vaporisateur")) {
            expectTypeOf(unit.instrument).toEqualTypeOf<Vaporisateur>()
            unit.instrument.cutoff = 900
        }
        const apparat = unit.setInstrument("Apparat")
        expectTypeOf(apparat).toEqualTypeOf<Apparat>()
        apparat.code = "// @param gain 0.5\nclass Processor {}"
        expect(unit.hasInstrument("Apparat")).toBe(true)
        expect(project.findInstrumentUnit(unit.label, "Apparat")?.instrument.parameters.length).toBe(1)
        expectTypeOf(unit.setInstrument("Nano")).toEqualTypeOf<Nano>()
        expect(() => unit.hasInstrument("Piano" as "Nano")).toThrow(RangeError)
    })
})

describe("Native parameter units", () => {
    it("converts Hz with the exponential curve the studio uses", () => {
        const {project} = createFixture()
        const bus = project.addAuxUnit()
        const eq = bus.addAudioEffect("Revamp")
        const frequency = project.parameter(eq, "highPass.frequency")
        expect(frequency.unit).toBe("Hz")
        expect(frequency.min).toBeCloseTo(20)
        expect(frequency.max).toBeCloseTo(20000)
        expect(frequency.toNormalized(20)).toBeCloseTo(0)
        expect(frequency.toNormalized(20000)).toBeCloseTo(1)
        expect(frequency.toNormalized(632.455)).toBeCloseTo(0.5, 4)
        expect(frequency.fromNormalized(frequency.toNormalized(440))).toBeCloseTo(440, 3)
        expect(frequency.toNormalized(5)).toBe(0)
        expect(frequency.format(440)).toContain("Hz")
        expect(frequency.value).toBeCloseTo(eq.highPass.frequency)
    })

    it("converts dB and booleans of channel strips", () => {
        const {project} = createFixture()
        const unit = project.addInstrumentUnit("Vaporisateur")
        const volume = project.parameter(unit, "volume")
        expect(volume.unit).toBe("dB")
        expect(volume.max).toBeCloseTo(6)
        expect(volume.min).toBe(Number.NEGATIVE_INFINITY)
        const values = [-48, -24, -12, -6, 0, 6]
        values.forEach(db => expect(volume.fromNormalized(volume.toNormalized(db))).toBeCloseTo(db, 3))
        expect(volume.toNormalized(-6)).toBeLessThan(volume.toNormalized(0))
        const mute = project.parameter(unit, "mute")
        expect([mute.toNormalized(true), mute.toNormalized(false), mute.toNormalized(1)]).toEqual([1, 0, 1])
        expect(mute.fromNormalized(1)).toBe(1)
        expect(() => project.parameter(unit, "label" as "volume")).toThrow(RangeError)
    })

    it("uses the ranges declared by script parameters", () => {
        const {project} = createFixture()
        const werkstatt = project.addAuxUnit().addAudioEffect("Werkstatt")
        werkstatt.code = "// @param tone 1000 20 20000 exp Hz\nclass Processor {}"
        const tone = project.parameter(werkstatt.parameter("tone"), "value")
        expect(tone.min).toBeCloseTo(20)
        expect(tone.max).toBeCloseTo(20000)
        expect(tone.fromNormalized(tone.toNormalized(1000))).toBeCloseTo(1000, 2)
        werkstatt.code = "// @param tone 1000 100 10000 exp Hz\nclass Processor {}"
        expect(project.parameter(werkstatt.parameter("tone"), "value").min).toBeCloseTo(100)
    })

    it("writes and reads automation in native units", () => {
        const {project} = createFixture()
        const bus = project.addAuxUnit()
        const eq = bus.addAudioEffect("Revamp")
        const lane = bus.addValueTrack(eq, "highPass.frequency")
        expect(lane.parameterInfo.unit).toBe("Hz")
        const region = lane.addRegion({duration: PPQN.Bar * 4})
        const [start, end] = region.addEvents([
            {position: 0, nativeValue: 80},
            {position: PPQN.Bar * 4, nativeValue: 2000}
        ])
        expect(start.nativeValue).toBeCloseTo(80, 2)
        expect(end.nativeValue).toBeCloseTo(2000, 1)
        expect(start.value).toBeCloseTo(lane.parameterInfo.toNormalized(80))
        end.nativeValue = 4000
        expect(end.value).toBeCloseTo(lane.parameterInfo.toNormalized(4000))
        const normalized = region.addEvent({position: PPQN.Bar, value: 0.5})
        expect(normalized.nativeValue).toBeCloseTo(632.455, 2)
        expect(() => region.addEvent({position: PPQN.Bar * 2, value: 0.5, nativeValue: 100})).toThrow(TypeError)
        const clip = lane.addClip()
        expect(clip.addEvent({nativeValue: 20}).value).toBeCloseTo(0)
    })
})

describe("Channel strip automation", () => {
    it("automates bus volume, mute and send levels in dB", () => {
        const {project} = createFixture()
        const synth = project.addInstrumentUnit("Vaporisateur")
        const reverb = project.addAuxUnit({label: "Reverb"})
        const send = synth.addSend(reverb, {amount: -18})
        const volume = reverb.addValueTrack(reverb, "volume")
        volume.addRegion({duration: PPQN.Bar * 8}).addEvents([
            {position: 0, nativeValue: -24},
            {position: PPQN.Bar * 8, nativeValue: -6}
        ])
        expect(volume.regions[0].events.map(event => Math.round(event.nativeValue))).toEqual([-24, -6])
        const amount = synth.addValueTrack(send, "amount")
        expect(amount.parameterInfo.unit).toBe("dB")
        const [point] = amount.addRegion().addEvents([{position: 0, nativeValue: -12}])
        expect(point.nativeValue).toBeCloseTo(-12, 3)
        const mute = project.output.addValueTrack(project.output, "mute")
        expect(mute.addRegion().addEvent({nativeValue: 1}).value).toBe(1)
        expect(reverb.valueTrack(reverb, "volume")).toBe(volume)
        expect(dbToGain(point.nativeValue)).toBeCloseTo(dbToGain(-12))
    })
    it("automates declared script device parameters by index path", () => {
        const {project} = createFixture()
        const unit = project.addInstrumentUnit("Apparat")
        unit.instrument.code = "// @param drive 0.5\n// @param motion 0.2\nclass Processor { process() {} }"
        const lane = unit.addValueTrack(unit.instrument, "parameters.1.value")
        lane.addRegion({duration: PPQN.Bar * 4}).addEvents([{position: 0, value: 0.2}, {position: PPQN.Bar * 4, value: 0.9}])
        expect(lane.regions[0].events.map(event => Math.round(event.value * 10) / 10)).toEqual([0.2, 0.9])
        expect(unit.valueTrack(unit.instrument, "parameters.1.value")).toBe(lane)
        expect(() => unit.addValueTrack(unit.instrument, "parameters.5.value")).toThrow(/Available: .*parameters\.1\.value/)
    })
})

describe("Marker positions", () => {
    it("keeps a marker at position 0 through removal, re-adding and applying", async () => {
        const {api, project} = createFixture()
        project.addMarker({position: PPQN.Bar * 4, label: "Old"})
        project.openInStudio()
        const bars = [0, 16, 32, 64]
        for (let round = 0; round < 2; round++) {
            const live = await api.getProject()
            live.markers.slice().forEach(marker => marker.remove())
            bars.forEach(bar => live.addMarker({position: bar * PPQN.Bar, label: `Bar ${bar + 1}`}))
            live.openInStudio()
            const again = await api.getProject()
            expect(again.markers.map(marker => marker.position / PPQN.Bar + 1)).toEqual([1, 17, 33, 65])
        }
    })

    it("clamps negative positions to the start", () => {
        const {project} = createFixture()
        const marker = project.addMarker({position: -PPQN.Bar * 15})
        expect(marker.position).toBe(0)
        marker.position = PPQN.Bar
        expect(marker.position).toBe(PPQN.Bar)
        marker.position = -1
        expect(marker.position).toBe(0)
        expect(() => marker.position = Number.NaN).toThrow(TypeError)
    })
})
